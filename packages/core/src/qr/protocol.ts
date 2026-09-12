import { sha256 } from '@noble/hashes/sha2.js';
import { NetProofError } from '../errors';
import { concat, fromHex, toHex, u32be, utf8 } from '../util/bytes';
import { bytesToUint256, decodeCbor, encodeCbor, uint256ToBytes } from './cbor';
import type { CborValue } from './cbor';
import { buildFrameSequence, FrameCollector } from './frames';
import type { AnimatedFrames } from './frames';
import { publicKeyToAddress, derivePath, EVM_SCHEMES, getScheme, fillTemplate } from '../crypto/hd';
import { HDKey } from '@scure/bip32';
import type { TypedDataPayload } from '../crypto/evm';

/**
 * The air-gap protocol. Each message family travels in exactly one direction, and
 * the device is the one that displays the *unsolicited* code:
 *
 *   device    -> companion NP-XPUB  watch-only export ("log in"): the device shows
 *                                   it, the companion scans it
 *   companion -> device   NP-REQ    sign requests (transaction / message / typed data)
 *   device    -> companion NP-SIG   signatures, plus an ack for rejected requests
 *   companion -> device   NP-ACK    receipt acknowledgment
 *
 * Every request carries a random 16-byte id and a hash of its own canonical bytes.
 * The device echoes both, so a companion can prove the response belongs to the
 * request it actually sent — and can detect a device that returns something else.
 */

export const PROTOCOL_VERSION = 1;

export interface XpubExportAccount {
  account: number;
  scheme: string;
  schemeLabel: string;
  xpubPath: string;
  xpub: string;
  firstAddress: string;
  firstAddressPath: string;
}

export interface XpubExportMessage {
  t: 'xpub';
  v: number;
  /**
   * Which key family this export belongs to.
   *
   * `evm` carries account-level xpubs, from which the companion derives addresses.
   * `solana` carries *addresses*, because SLIP-0010's ed25519 derivation is
   * hardened-only: there is no account-level public key to watch. Absent means `evm`,
   * so a payload from an older device still decodes.
   */
  family?: 'evm' | 'solana';
  /**
   * Solana watch list: derivation path plus the address at that path.
   *
   * Sending addresses instead of keys is weaker in one specific way, and the UI must
   * say so: the companion cannot discover further Solana addresses on its own, and it
   * cannot verify that a path leads to the address it was told. The device re-derives
   * and checks both on every signature, so a lie fails closed at signing time.
   */
  addresses?: { path: string; address: string }[];
  /**
   * Chain the device was pointed at when it showed this code.
   *
   * Optional so a payload without it still decodes, but the device always sends it:
   * the user picks a network before displaying the code precisely so the companion
   * lands on the right token list instead of defaulting to Ethereum.
   */
  chainId?: number;
  /** Master fingerprint, the wallet's stable identity. */
  fingerprint: string;
  /** True when a BIP39 passphrase is applied, so the companion must warn the user. */
  passphraseProtected: boolean;
  rootXpub: string;
  coinType: number;
  accounts: XpubExportAccount[];
  schemes: { id: string; label: string; xpubPath: string; receive: string; change: string | null }[];
  device: { name: string; model: string };
}

export type SignRequestKind = 'tx' | 'msg' | 'typed';

export interface SignRequestMessage {
  t: 'req';
  v: number;
  /** Random 16-byte correlation id. */
  id: string;
  kind: SignRequestKind;
  /** Derivation path the device must sign with, e.g. m/44'/60'/0'/0/3. */
  path: string;
  /** Address the companion believes this path controls. The device verifies it. */
  address: string;
  /** Chain id, for display and for the transaction signature. */
  chainId: number;
  /** Origin/website that asked for the signature (dApp connect flow). */
  origin?: string;
  /** sha256 of the canonical request bytes; echoed in the response. */
  claim: string;
  tx?: {
    type: 'eip1559' | 'legacy';
    nonce: number;
    to: string | null;
    value: string;
    data: string;
    gas: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
  };
  message?: {
    /** UTF-8 text for personal_sign; the device re-hashes it locally. */
    text: string;
    /** Set when the payload was arbitrary bytes rather than text. */
    hex?: string;
  };
  typed?: TypedDataPayload;
}

export interface SignResponseMessage {
  t: 'sig';
  v: number;
  /** Echo of the request id. */
  id: string;
  ok: boolean;
  kind: SignRequestKind;
  address: string;
  /** Echo of the request claim, so the companion can bind the response. */
  claim: string;
  /** Signed transaction (hex, EIP-2718) for `kind: 'tx'`. */
  raw?: string;
  /** 65-byte signature for message/typed-data requests. */
  signature?: string;
  /** 32-byte digest the device actually signed. */
  digest: string;
  error?: string;
}

export interface AckMessage {
  t: 'ack';
  v: number;
  id: string;
  ok: boolean;
  error?: string;
}

export type ProtocolMessage =
  | XpubExportMessage
  | SignRequestMessage
  | SignResponseMessage
  | AckMessage;

/** Canonical CBOR bytes of a message. This is what gets hashed and framed. */
export function encodeMessage(message: ProtocolMessage): Uint8Array {
  return encodeCbor(toCbor(message));
}

export function decodeMessage(bytes: Uint8Array): ProtocolMessage {
  const value = decodeCbor(bytes);
  if (value === null || typeof value !== 'object' || value instanceof Uint8Array || Array.isArray(value)) {
    throw new NetProofError('PROTOCOL_INVALID', 'protocol message must be a CBOR map');
  }
  const map = value as Record<string, CborValue>;
  const type = map.t;
  const version = Number(map.v);
  if (version !== PROTOCOL_VERSION) {
    throw new NetProofError(
      'PROTOCOL_INVALID',
      `unsupported protocol version ${String(map.v)} (this build speaks version ${PROTOCOL_VERSION})`,
    );
  }
  switch (type) {
    case 'xpub':
      return parseXpub(map);
    case 'req':
      return parseSignRequest(map);
    case 'sig':
      return parseSignResponse(map);
    case 'ack':
      return parseAck(map);
    default:
      throw new NetProofError('PROTOCOL_UNKNOWN_TYPE', `unknown message type ${String(type)}`);
  }
}

/**
 * `claim` binds a request (and its response) to an exact byte sequence. Both sides
 * compute it from the canonical encoding, so neither can be tricked into signing
 * something other than what was displayed.
 */
export function requestClaim(id: string, kind: SignRequestKind, canonicalBody: Uint8Array): string {
  return toHex(sha256(concat(utf8('netproof/claim/v1'), fromHex(id), utf8(kind), canonicalBody)), true);
}

function toCbor(message: ProtocolMessage): CborValue {
  switch (message.t) {
    case 'xpub':
      return {
        t: 'xpub',
        v: message.v,
        ...(message.chainId !== undefined ? { c: message.chainId } : {}),
        ...(message.family !== undefined ? { fam: message.family } : {}),
        ...(message.addresses !== undefined
          ? { addr: message.addresses.map((entry) => ({ p: entry.path, a: entry.address })) }
          : {}),
        fp: message.fingerprint,
        pw: message.passphraseProtected,
        root: message.rootXpub,
        ct: message.coinType,
        dev: { name: message.device.name, model: message.device.model },
        sch: message.schemes.map((scheme) => ({
          id: scheme.id,
          label: scheme.label,
          xp: scheme.xpubPath,
          rcv: scheme.receive,
          chg: scheme.change ?? '',
        })),
        acc: message.accounts.map((account) => ({
          a: account.account,
          s: account.scheme,
          xp: account.xpubPath,
          x: account.xpub,
          fa: account.firstAddress,
        })),
      };
    case 'req': {
      const base: Record<string, CborValue> = {
        t: 'req',
        v: message.v,
        id: fromHex(message.id),
        k: message.kind,
        p: message.path,
        a: message.address,
        c: message.chainId,
        claim: fromHex(message.claim),
      };
      if (message.origin !== undefined) base.o = message.origin;
      if (message.tx) {
        base.tx = {
          ty: message.tx.type,
          n: message.tx.nonce,
          to: message.tx.to === null ? new Uint8Array(0) : fromHex(message.tx.to),
          v: uint256ToBytes(BigInt(message.tx.value)),
          d: fromHex(message.tx.data),
          g: BigInt(message.tx.gas),
          ...(message.tx.maxFeePerGas !== undefined ? { mf: BigInt(message.tx.maxFeePerGas) } : {}),
          ...(message.tx.maxPriorityFeePerGas !== undefined
            ? { mp: BigInt(message.tx.maxPriorityFeePerGas) }
            : {}),
          ...(message.tx.gasPrice !== undefined ? { gp: BigInt(message.tx.gasPrice) } : {}),
        };
      }
      if (message.message) {
        base.msg = {
          t: message.message.text,
          ...(message.message.hex !== undefined ? { h: fromHex(message.message.hex) } : {}),
        };
      }
      if (message.typed) {
        base.td = {
          domain: message.typed.domain as CborValue,
          types: message.typed.types as unknown as CborValue,
          primaryType: message.typed.primaryType,
          message: message.typed.message as CborValue,
        };
      }
      return base;
    }
    case 'sig': {
      const base: Record<string, CborValue> = {
        t: 'sig',
        v: message.v,
        id: fromHex(message.id),
        ok: message.ok,
        k: message.kind,
        a: message.address,
        claim: fromHex(message.claim),
        dg: fromHex(message.digest),
      };
      if (message.raw !== undefined) base.raw = message.raw;
      if (message.signature !== undefined) base.sig = fromHex(message.signature);
      if (message.error !== undefined) base.err = message.error;
      return base;
    }
    case 'ack':
      return {
        t: 'ack',
        v: message.v,
        id: fromHex(message.id),
        ok: message.ok,
        ...(message.error !== undefined ? { err: message.error } : {}),
      };
  }
}

function parseXpub(map: Record<string, CborValue>): XpubExportMessage {
  const dev = (map.dev ?? {}) as Record<string, CborValue>;
  return {
    t: 'xpub',
    v: PROTOCOL_VERSION,
    ...(typeof map.c === 'number' ? { chainId: map.c } : {}),
    ...(map.fam === 'solana' || map.fam === 'evm' ? { family: map.fam } : {}),
    ...(Array.isArray(map.addr)
      ? {
          addresses: map.addr.map((entry) => {
            const item = entry as Record<string, CborValue>;
            return {
              path: requireString(item.p, 'addr.p'),
              address: requireString(item.a, 'addr.a'),
            };
          }),
        }
      : {}),
    fingerprint: requireString(map.fp, 'fp'),
    passphraseProtected: map.pw === true,
    rootXpub: requireString(map.root, 'root'),
    coinType: requireNumber(map.ct, 'ct'),
    device: {
      name: typeof dev.name === 'string' ? dev.name : 'NetProof',
      model: typeof dev.model === 'string' ? dev.model : 'unknown',
    },
    schemes: requireArray(map.sch, 'sch').map((entry) => {
      const scheme = entry as Record<string, CborValue>;
      const change = typeof scheme.chg === 'string' && scheme.chg.length > 0 ? scheme.chg : null;
      return {
        id: requireString(scheme.id, 'sch.id'),
        label: requireString(scheme.label, 'sch.label'),
        xpubPath: requireString(scheme.xp, 'sch.xp'),
        receive: requireString(scheme.rcv, 'sch.rcv'),
        change,
      };
    }),
    accounts: requireArray(map.acc, 'acc').map((entry) => {
      const account = entry as Record<string, CborValue>;
      return {
        account: requireNumber(account.a, 'acc.a'),
        scheme: requireString(account.s, 'acc.s'),
        schemeLabel:
          EVM_SCHEMES.find((candidate) => candidate.id === account.s)?.label ?? String(account.s),
        xpubPath: requireString(account.xp, 'acc.xp'),
        xpub: requireString(account.x, 'acc.x'),
        firstAddress: requireString(account.fa, 'acc.fa'),
        firstAddressPath: fillTemplate(
          EVM_SCHEMES.find((candidate) => candidate.id === account.s)?.receiveTemplate ?? '{index}',
          requireNumber(account.a, 'acc.a'),
          0,
        ),
      };
    }),
  };
}

function parseSignRequest(map: Record<string, CborValue>): SignRequestMessage {
  const kind = map.k as SignRequestKind;
  if (kind !== 'tx' && kind !== 'msg' && kind !== 'typed') {
    throw new NetProofError('PROTOCOL_INVALID', `unknown sign request kind ${String(map.k)}`);
  }
  const message: SignRequestMessage = {
    t: 'req',
    v: PROTOCOL_VERSION,
    id: toHex(requireBytes(map.id, 'id'), true),
    kind,
    path: requireString(map.p, 'p'),
    address: requireString(map.a, 'a'),
    chainId: requireNumber(map.c, 'c'),
    claim: toHex(requireBytes(map.claim, 'claim'), true),
  };
  if (typeof map.o === 'string') message.origin = map.o;
  if (map.tx !== undefined) {
    const tx = map.tx as Record<string, CborValue>;
    const toBytes = requireBytes(tx.to, 'tx.to');
    message.tx = {
      type: tx.ty === 'legacy' ? 'legacy' : 'eip1559',
      nonce: requireNumber(tx.n, 'tx.n'),
      to: toBytes.length === 0 ? null : toHex(toBytes, true),
      value: bytesToUint256(requireBytes(tx.v, 'tx.v')).toString(),
      data: toHex(requireBytes(tx.d, 'tx.d'), true),
      gas: String(tx.g),
      ...(tx.mf !== undefined ? { maxFeePerGas: String(tx.mf) } : {}),
      ...(tx.mp !== undefined ? { maxPriorityFeePerGas: String(tx.mp) } : {}),
      ...(tx.gp !== undefined ? { gasPrice: String(tx.gp) } : {}),
    };
  }
  if (map.msg !== undefined) {
    const msg = map.msg as Record<string, CborValue>;
    message.message = {
      text: requireString(msg.t, 'msg.t'),
      ...(msg.h instanceof Uint8Array ? { hex: toHex(msg.h, true) } : {}),
    };
  }
  if (map.td !== undefined) {
    const td = map.td as Record<string, CborValue>;
    message.typed = {
      domain: td.domain as Record<string, unknown>,
      types: td.types as unknown as TypedDataPayload['types'],
      primaryType: requireString(td.primaryType, 'td.primaryType'),
      message: td.message as Record<string, unknown>,
    };
  }
  return message;
}

function parseSignResponse(map: Record<string, CborValue>): SignResponseMessage {
  const kind = map.k as SignRequestKind;
  const response: SignResponseMessage = {
    t: 'sig',
    v: PROTOCOL_VERSION,
    id: toHex(requireBytes(map.id, 'id'), true),
    ok: map.ok === true,
    kind,
    address: requireString(map.a, 'a'),
    claim: toHex(requireBytes(map.claim, 'claim'), true),
    digest: toHex(requireBytes(map.dg, 'dg'), true),
  };
  if (typeof map.raw === 'string') response.raw = map.raw;
  if (map.sig instanceof Uint8Array) response.signature = toHex(map.sig, true);
  if (typeof map.err === 'string') response.error = map.err;
  if (response.ok && response.raw === undefined && response.signature === undefined) {
    throw new NetProofError('PROTOCOL_INVALID', 'a successful response must carry a signature');
  }
  return response;
}

function parseAck(map: Record<string, CborValue>): AckMessage {
  return {
    t: 'ack',
    v: PROTOCOL_VERSION,
    id: toHex(requireBytes(map.id, 'id'), true),
    ok: map.ok === true,
    ...(typeof map.err === 'string' ? { error: map.err } : {}),
  };
}

function requireString(value: CborValue | undefined, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new NetProofError('PROTOCOL_INVALID', `missing or invalid string field "${field}"`);
  }
  return value;
}

function requireNumber(value: CborValue | undefined, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint' && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  throw new NetProofError('PROTOCOL_INVALID', `missing or invalid number field "${field}"`);
}

function requireBytes(value: CborValue | undefined, field: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new NetProofError('PROTOCOL_INVALID', `missing or invalid byte field "${field}"`);
  }
  return value;
}

function requireArray(value: CborValue | undefined, field: string): CborValue[] {
  if (!Array.isArray(value)) {
    throw new NetProofError('PROTOCOL_INVALID', `missing or invalid array field "${field}"`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// High level helpers shared by both applications
// ---------------------------------------------------------------------------

export function buildXpubMessage(
  wallet: {
    /** Chain the user selected on the device, carried so the companion can follow. */
    chainId?: number;
    /** Key family; see XpubExportMessage.family. */
    family?: 'evm' | 'solana';
    /** Solana watch list; ignored for EVM. */
    addresses?: { path: string; address: string }[];
    masterFingerprint: string;
    passphraseProtected: boolean;
    rootXpub: string;
    coinType: number;
    accounts: XpubExportAccount[];
    schemes: { id: string; label: string; xpubPath: string; receiveTemplate: string; changeTemplate: string | null }[];
  },
  device: { name: string; model: string },
): XpubExportMessage {
  return {
    t: 'xpub',
    v: PROTOCOL_VERSION,
    ...(wallet.chainId !== undefined ? { chainId: wallet.chainId } : {}),
    ...(wallet.family !== undefined ? { family: wallet.family } : {}),
    ...(wallet.addresses !== undefined ? { addresses: wallet.addresses } : {}),
    fingerprint: wallet.masterFingerprint,
    passphraseProtected: wallet.passphraseProtected,
    rootXpub: wallet.rootXpub,
    coinType: wallet.coinType,
    device,
    schemes: wallet.schemes.map((scheme) => ({
      id: scheme.id,
      label: scheme.label,
      xpubPath: scheme.xpubPath,
      receive: scheme.receiveTemplate,
      change: scheme.changeTemplate,
    })),
    accounts: wallet.accounts.map((account) => ({
      account: account.account,
      scheme: account.scheme,
      schemeLabel: account.schemeLabel,
      xpubPath: account.xpubPath,
      xpub: account.xpub,
      firstAddress: account.firstAddress,
      firstAddressPath: account.firstAddressPath,
    })),
  };
}

/** Turn a sign request into its claim: the hash of its canonical encoding. */
export function signRequestClaim(request: Omit<SignRequestMessage, 'claim'>): string {
  const withPlaceholder = { ...request, claim: '0'.repeat(64) } as SignRequestMessage;
  const canonical = encodeMessage(withPlaceholder);
  return requestClaim(request.id, request.kind, canonical);
}

export function buildSignRequestMessage(
  request: Omit<SignRequestMessage, 'v' | 'claim'>,
): SignRequestMessage {
  const withVersion = { ...request, v: PROTOCOL_VERSION } as Omit<SignRequestMessage, 'claim'>;
  return { ...withVersion, claim: signRequestClaim(withVersion) } as SignRequestMessage;
}

export function framesForMessage(
  type: 'NP-XPUB' | 'NP-REQ' | 'NP-SIG' | 'NP-ACK',
  message: ProtocolMessage,
  fragmentLength?: number,
): AnimatedFrames {
  return buildFrameSequence(
    type,
    encodeMessage(message),
    fragmentLength === undefined ? {} : { fragmentLength },
  );
}

/** Convenience: collect frames until a complete protocol message is recovered. */
export function collectorFor(type: 'NP-XPUB' | 'NP-REQ' | 'NP-SIG' | 'NP-ACK'): FrameCollector {
  return new FrameCollector(type);
}

export function messageFromFrames(bytes: Uint8Array): ProtocolMessage {
  return decodeMessage(bytes);
}

export interface ResolvedAccount {
  account: number;
  scheme: string;
  address: string;
  path: string;
  xpub: string;
}

/**
 * Derive an address from an exported xpub on the companion side. Hardened
 * derivation is impossible here by design: the companion only ever holds public
 * keys, so it can never spend.
 */
export function deriveAddressFromXpub(
  xpub: string,
  schemeId: string,
  account: number,
  index: number,
  /**
   * Where this key actually sits, when that is known.
   *
   * A wallet paired before the export moved from the third level to the fourth still holds a
   * third-level key. Deriving from it with today's scheme would walk the wrong suffix and
   * produce a *different address* — silently, and on the one screen whose job is to prove the
   * addresses are right. The export records its own path, so the path travels with the key.
   */
  xpubPath?: string,
): ResolvedAccount {
  const scheme = getScheme(schemeId);
  const node = HDKey.fromExtendedKey(xpub);
  // The xpub already sits at its own level; derive the remaining non-hardened suffix only.
  const target = fillTemplate(scheme.receiveTemplate, account, index);
  const accountPath = xpubPath ?? fillTemplate(scheme.xpubPath, account);
  const relative = target.slice(accountPath.length).replace(/^\//u, '');
  const derived = relative.length === 0 ? node : derivePath(node, `m/${relative}`);
  return {
    account,
    scheme: schemeId,
    address: publicKeyToAddress(derived.publicKey!),
    path: target,
    xpub,
  };
}

export { u32be };
