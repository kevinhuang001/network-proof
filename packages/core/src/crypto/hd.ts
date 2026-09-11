import { HDKey } from '@scure/bip32';

export { HDKey };
import { keccak_256 } from '@noble/hashes/sha3.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { NetProofError } from '../errors';
import { toHex } from '../util/bytes';

/** SLIP-44 coin type for every EVM chain. */
export const EVM_COIN_TYPE = 60;
export const HARDENED = 0x80000000;

/**
 * The derivation schemes an EVM companion wallet may need. We export account-level
 * extended public keys so the companion can derive as many addresses as it likes
 * without ever holding a private key, for *every* path family in common use.
 */
export interface DerivationScheme {
  id: string;
  label: string;
  /** Where the exported xpub sits. `{account}` is substituted. */
  xpubPath: string;
  /** How the companion derives the i-th receiving address from that xpub. */
  receiveTemplate: string;
  changeTemplate: string | null;
  /** Documented by whom / used by which wallets. */
  note: string;
}

/**
 * BIP44, and only BIP44.
 *
 * This wallet used to offer Ledger Live's account model and MyEtherWallet's legacy chain as
 * well. Both are real derivations that some existing wallet uses, and both were a way to
 * import a seed and see an address the user did not recognise — which, on an import screen
 * whose entire purpose is "did this produce the wallet I already had?", is the worst
 * possible extra. MetaMask, OKX Web3, Trust Wallet and imToken all use BIP44, so a seed
 * restored into any of them lands on the same addresses here.
 *
 * Adding a scheme back is a deliberate act, not a menu option: the flat account list
 * derives account i as `m/44'/60'/0'/0/i`, which is unbounded by design.
 */
export const EVM_SCHEMES: DerivationScheme[] = [
  {
    id: 'bip44',
    label: 'BIP44',
    xpubPath: "m/44'/60'/{account}'",
    receiveTemplate: "m/44'/60'/{account}'/0/{index}",
    changeTemplate: "m/44'/60'/{account}'/1/{index}",
    note: 'MetaMask、OKX Web3、Trust Wallet、imToken 默认路径',
  },
];

export function getScheme(id: string): DerivationScheme {
  const scheme = EVM_SCHEMES.find((candidate) => candidate.id === id);
  if (!scheme) {
    throw new NetProofError('PATH_INVALID', `unknown derivation scheme: ${id}`, {
      available: EVM_SCHEMES.map((s) => s.id),
    });
  }
  return scheme;
}

export function fillTemplate(template: string, account: number, index = 0): string {
  return template.replace('{account}', String(account)).replace('{index}', String(index));
}

/** Parse a BIP32 path into raw uint32 child indices (hardened bit included). */
export function parsePath(path: string): number[] {
  const trimmed = path.trim();
  if (trimmed === 'm' || trimmed === 'M' || trimmed === '') return [];
  // Must be exactly "m" or start with "m/"; a bare "44/0" is a common typo that
  // would otherwise be silently interpreted as an absolute path.
  if (!/^m(\/|$)/u.test(trimmed)) {
    throw new NetProofError('PATH_INVALID', `path must start with m/: ${path}`);
  }
  const body = trimmed.replace(/^m\/?/u, '');
  if (body.length === 0) return [];
  return body.split('/').map((segment) => {
    const hardened = segment.endsWith("'") || segment.endsWith('h') || segment.endsWith('H');
    const digits = hardened ? segment.slice(0, -1) : segment;
    if (!/^\d+$/u.test(digits)) {
      throw new NetProofError('PATH_INVALID', `invalid path segment "${segment}" in ${path}`);
    }
    const value = Number.parseInt(digits, 10);
    if (value >= HARDENED) {
      throw new NetProofError('PATH_INVALID', `path segment ${segment} exceeds the hardened range`);
    }
    return hardened ? value + HARDENED : value;
  });
}

export function formatPath(indices: number[]): string {
  if (indices.length === 0) return 'm';
  return (
    'm/' +
    indices
      .map((index) => (index >= HARDENED ? `${index - HARDENED}'` : String(index)))
      .join('/')
  );
}

export function isHardened(index: number): boolean {
  return index >= HARDENED;
}

/**
 * Derive a path from a node. Hardened derivation requires the private key, so a
 * watch-only companion holding only an xpub must never ask for one — this throws
 * a distinguishable error instead of silently producing a wrong key.
 */
export function derivePath(node: HDKey, path: string): HDKey {
  const indices = parsePath(path);
  let current = node;
  for (const index of indices) {
    if (isHardened(index) && !current.privateKey) {
      throw new NetProofError(
        'DERIVATION_HARDENED_NEEDS_PRIVATE',
        `cannot derive hardened child ${formatPath([index])} from a public-only key`,
      );
    }
    current = current.deriveChild(index);
  }
  return current;
}

export function parentFingerprint(node: HDKey): number {
  return node.parentFingerprint ?? 0;
}

export function fingerprint(node: HDKey): number {
  return node.fingerprint;
}

export function fingerprintHex(node: HDKey): string {
  return toHex(new Uint8Array([(node.fingerprint >>> 24) & 0xff, (node.fingerprint >>> 16) & 0xff, (node.fingerprint >>> 8) & 0xff, node.fingerprint & 0xff]));
}

export function publicKeyToAddress(publicKey: Uint8Array): string {
  if (publicKey.length === 33) {
    // Compressed key: decompress via the curve to get the 64-byte body.
    const point = secp256k1.Point.fromBytes(publicKey).toAffine();
    return addressFromXY(point.x, point.y);
  }
  if (publicKey.length === 65) {
    if (publicKey[0] !== 0x04) {
      throw new NetProofError('KEY_MISSING_PRIVATE', 'uncompressed public key must start with 0x04');
    }
    return addressFromUncompressedBody(publicKey.subarray(1));
  }
  throw new NetProofError('KEY_MISSING_PRIVATE', `unsupported public key length ${publicKey.length}`);
}

function addressFromUncompressedBody(body: Uint8Array): string {
  const digest = keccak_256(body);
  return checksumAddress(toHex(digest.subarray(12)));
}

function addressFromXY(xPoint: bigint, yPoint: bigint): string {
  const body = new Uint8Array(64);
  body.set(bigintTo32(xPoint), 0);
  body.set(bigintTo32(yPoint), 32);
  return addressFromUncompressedBody(body);
}

function bigintTo32(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new NetProofError('KEY_MISSING_PRIVATE', 'coordinate does not fit in 32 bytes');
  return out;
}

/** EIP-55 checksummed address. */
export function checksumAddress(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/u, '');
  if (!/^[0-9a-f]{40}$/u.test(lower)) {
    throw new NetProofError('TX_INVALID_FIELD', `not an EVM address: ${address}`);
  }
  const digest = toHex(keccak_256(new TextEncoder().encode(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += Number.parseInt(digest[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/u.test(value);
}

export function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

export interface AccountExport {
  /** Account index used in the derivation templates. */
  account: number;
  scheme: string;
  schemeLabel: string;
  /** Path of the exported extended public key. */
  xpubPath: string;
  xpub: string;
  /** First address of the account, for display on the device. */
  firstAddress: string;
  firstAddressPath: string;
  /** Chain code and public key, so the companion can verify the xpub encoding. */
  chainCode: string;
  publicKey: string;
}

export interface WalletExport {
  version: 1;
  /** BIP32 master fingerprint (hex), the wallet's stable identity. */
  masterFingerprint: string;
  /** True when a BIP39 passphrase was applied; the companion must not assume defaults. */
  passphraseProtected: boolean;
  /** Root xpub for the full wallet, so the companion can derive anything. */
  rootXpub: string;
  coinType: number;
  accounts: AccountExport[];
  schemes: DerivationScheme[];
}

/**
 * Build the full watch-only export: root xpub plus an account-level xpub for every
 * supported scheme and account index. This is what the companion scans to "log in".
 */
export function buildWalletExport(
  root: HDKey,
  options: { accounts?: number; schemes?: DerivationScheme[]; passphraseProtected?: boolean } = {},
): WalletExport {
  if (!root.privateKey && !root.publicKey) {
    throw new NetProofError('KEY_MISSING_PRIVATE', 'root node has no key material');
  }
  const accountCount = options.accounts ?? 1;
  if (accountCount < 1 || accountCount > 100) {
    throw new NetProofError('PATH_INVALID', 'account count must be between 1 and 100');
  }
  const schemes = options.schemes ?? EVM_SCHEMES;

  const accounts: AccountExport[] = [];
  for (let account = 0; account < accountCount; account++) {
    for (const scheme of schemes) {
      const xpubPath = fillTemplate(scheme.xpubPath, account);
      const node = derivePath(root, xpubPath);
      const firstAddressPath = fillTemplate(scheme.receiveTemplate, account, 0);
      const firstAddress = publicKeyToAddress(derivePath(root, firstAddressPath).publicKey!);
      accounts.push({
        account,
        scheme: scheme.id,
        schemeLabel: scheme.label,
        xpubPath,
        xpub: node.publicExtendedKey,
        firstAddress,
        firstAddressPath,
        chainCode: toHex(node.chainCode!),
        publicKey: toHex(node.publicKey!),
      });
    }
  }

  return {
    version: 1,
    masterFingerprint: fingerprintHex(root),
    passphraseProtected: options.passphraseProtected ?? false,
    rootXpub: root.publicExtendedKey,
    coinType: EVM_COIN_TYPE,
    accounts,
    schemes,
  };
}
