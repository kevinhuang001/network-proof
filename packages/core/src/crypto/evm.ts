import { keccak_256 } from '@noble/hashes/sha3.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  hashTypedData,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
} from 'viem';
import type { Hex } from 'viem';
import { NetProofError } from '../errors';
import { bigIntToBytes, bytesToBigInt, concat, toHex, utf8 } from '../util/bytes';
import { checksumAddress, publicKeyToAddress } from './hd';

export interface EvmTransactionRequest {
  /** Only the two types the device supports. */
  type: 'eip1559' | 'legacy';
  chainId: number;
  nonce: number;
  /** `null` means contract creation. */
  to: string | null;
  value: bigint;
  data: string;
  /** Gas limit. Required: the device never signs a request whose gas it cannot show. */
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

export interface EvmSignature {
  r: string;
  s: string;
  /** 0 or 1. */
  yParity: number;
  /** Legacy-style v: 27/28 for messages, chainId*2+35+yParity for EIP-155 transactions. */
  v: bigint;
  /** 65-byte `r || s || v` signature with v = 27/28 — the `personal_sign` wire format. */
  serialized: string;
}

export interface SignedTransaction {
  rawTransaction: string;
  hash: string;
  from: string;
  yParity: number;
}

export function privateKeyToAddress(privateKey: Uint8Array): string {
  validatePrivateKey(privateKey);
  return publicKeyToAddress(secp256k1.getPublicKey(privateKey, false));
}

export function validatePrivateKey(privateKey: Uint8Array): void {
  if (privateKey.length !== 32) {
    throw new NetProofError('KEY_MISSING_PRIVATE', `private key must be 32 bytes, got ${privateKey.length}`);
  }
  const value = bytesToBigInt(privateKey);
  if (value === 0n || value >= secp256k1.Point.Fn.ORDER) {
    throw new NetProofError('KEY_MISSING_PRIVATE', 'private key is outside the valid secp256k1 range');
  }
}

/**
 * Deterministic (RFC 6979) low-S ECDSA over an already-hashed 32-byte digest.
 *
 * Note on `format: 'recovered'`: noble 2.x encodes the recovery id *first*
 * (`recovery || r || s`), which is not the Ethereum `r || s || v` layout, so we
 * parse it back through `Signature.fromBytes(..., 'recovered')` rather than
 * slicing bytes by hand.
 */
export function signHashWithKey(
  digest: Uint8Array,
  privateKey: Uint8Array,
): { r: bigint; s: bigint; recovery: number } {
  validatePrivateKey(privateKey);
  if (digest.length !== 32) {
    throw new NetProofError('TX_INVALID_FIELD', `digest must be 32 bytes, got ${digest.length}`);
  }
  // `prehash: false` because the caller already applied keccak256.
  const raw = secp256k1.sign(digest, privateKey, { prehash: false, format: 'recovered' });
  const signature = secp256k1.Signature.fromBytes(raw, 'recovered');
  const recovery = signature.recovery;
  if (recovery === undefined) {
    throw new NetProofError('TX_INVALID_FIELD', 'signature is missing its recovery id');
  }
  return { r: signature.r, s: signature.s, recovery };
}

function toEvmSignature(r: bigint, s: bigint, recovery: number, legacyV?: bigint): EvmSignature {
  const v = legacyV ?? BigInt(27 + recovery);
  return {
    r: toHex(bigIntToBytes(r, 32), true),
    s: toHex(bigIntToBytes(s, 32), true),
    yParity: recovery,
    v,
    serialized: toHex(
      concat(bigIntToBytes(r, 32), bigIntToBytes(s, 32), new Uint8Array([Number(v)])),
      true,
    ),
  };
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new NetProofError('TX_INVALID_FIELD', 'hex string has an odd length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new NetProofError('TX_INVALID_FIELD', `invalid hex at offset ${i * 2}`);
    out[i] = byte;
  }
  return out;
}

/** EIP-191 `personal_sign`: keccak256("\x19Ethereum Signed Message:\n" + len + message). */
export function hashPersonalMessage(message: Uint8Array | string): Uint8Array {
  const bytes = typeof message === 'string' ? utf8(message) : message;
  return keccak_256(concat(utf8(`\x19Ethereum Signed Message:\n${bytes.length}`), bytes));
}

export function signPersonalMessage(message: Uint8Array | string, privateKey: Uint8Array): EvmSignature {
  const { r, s, recovery } = signHashWithKey(hashPersonalMessage(message), privateKey);
  return toEvmSignature(r, s, recovery);
}

export interface TypedDataPayload {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export function hashTypedDataPayload(payload: TypedDataPayload): Uint8Array {
  return hexToBytes(hashTypedData(payload as never));
}

/** EIP-712 typed-data signing, as used by Permit2, Seaport and most DeFi flows. */
export function signTypedData(payload: TypedDataPayload, privateKey: Uint8Array): EvmSignature {
  const { r, s, recovery } = signHashWithKey(hashTypedDataPayload(payload), privateKey);
  return toEvmSignature(r, s, recovery);
}

export function validateTransactionRequest(request: EvmTransactionRequest): void {
  if (!Number.isInteger(request.chainId) || request.chainId < 1) {
    throw new NetProofError('TX_INVALID_FIELD', `invalid chainId ${request.chainId}`);
  }
  if (!Number.isInteger(request.nonce) || request.nonce < 0) {
    throw new NetProofError('TX_INVALID_FIELD', `invalid nonce ${request.nonce}`);
  }
  if (request.to !== null && !/^0x[0-9a-fA-F]{40}$/u.test(request.to)) {
    throw new NetProofError('TX_INVALID_FIELD', `invalid to address ${String(request.to)}`);
  }
  if (!/^0x([0-9a-fA-F]{2})*$/u.test(request.data)) {
    throw new NetProofError('TX_INVALID_FIELD', 'data must be an even-length 0x-prefixed hex string');
  }
  if (request.value < 0n) throw new NetProofError('TX_INVALID_FIELD', 'value cannot be negative');
  if (request.gas === undefined || request.gas <= 0n) {
    throw new NetProofError('TX_INVALID_FIELD', 'gas limit is required and must be positive');
  }
  if (request.type === 'eip1559') {
    if (request.maxFeePerGas === undefined || request.maxPriorityFeePerGas === undefined) {
      throw new NetProofError(
        'TX_INVALID_FIELD',
        'eip1559 transaction requires maxFeePerGas and maxPriorityFeePerGas',
      );
    }
    if (request.maxPriorityFeePerGas > request.maxFeePerGas) {
      throw new NetProofError('TX_INVALID_FIELD', 'maxPriorityFeePerGas cannot exceed maxFeePerGas');
    }
  } else if (request.type === 'legacy') {
    if (request.gasPrice === undefined) {
      throw new NetProofError('TX_INVALID_FIELD', 'legacy transaction requires gasPrice');
    }
  } else {
    throw new NetProofError('TX_UNSUPPORTED_TYPE', `unsupported transaction type ${String(request.type)}`);
  }
}

/** Canonical viem transaction object built from a validated request. */
function toViemTransaction(request: EvmTransactionRequest) {
  const base = {
    chainId: request.chainId,
    nonce: request.nonce,
    to: (request.to ?? null) as Hex | null,
    value: request.value,
    data: request.data as Hex,
    gas: request.gas,
  };
  if (request.type === 'eip1559') {
    return {
      ...base,
      type: 'eip1559' as const,
      maxFeePerGas: request.maxFeePerGas,
      maxPriorityFeePerGas: request.maxPriorityFeePerGas,
    };
  }
  return { ...base, type: 'legacy' as const, gasPrice: request.gasPrice };
}

/** EIP-2718 unsigned payload. `serializeTransaction` already returns a hex string. */
export function serializeUnsigned(request: EvmTransactionRequest): string {
  validateTransactionRequest(request);
  return serializeTransaction(toViemTransaction(request) as never) as string;
}

export function transactionSigningHash(request: EvmTransactionRequest): Uint8Array {
  return keccak_256(hexToBytes(serializeUnsigned(request)));
}

/**
 * Sign an EVM transaction. The device recomputes the payload from the *displayed*
 * fields, so what the user approved on screen is exactly what gets signed.
 */
export function signTransaction(
  request: EvmTransactionRequest,
  privateKey: Uint8Array,
): SignedTransaction {
  const unsigned = serializeUnsigned(request);
  const { r, s, recovery } = signHashWithKey(keccak_256(hexToBytes(unsigned)), privateKey);
  const v = request.type === 'legacy' ? BigInt(request.chainId) * 2n + 35n + BigInt(recovery) : undefined;

  const rawTransaction = serializeTransaction(
    toViemTransaction(request) as never,
    (request.type === 'legacy'
      ? { r: toHex(bigIntToBytes(r, 32), true), s: toHex(bigIntToBytes(s, 32), true), v: v! }
      : {
          r: toHex(bigIntToBytes(r, 32), true),
          s: toHex(bigIntToBytes(s, 32), true),
          yParity: recovery,
        }) as never,
  ) as string;

  return {
    rawTransaction,
    hash: toHex(keccak_256(hexToBytes(rawTransaction)), true),
    from: checksumAddress(privateKeyToAddress(privateKey)),
    yParity: recovery,
  };
}

/**
 * Companion-side verification: recover the sender from a signed payload and check
 * it matches the address the device claims to have signed with, and that the hash
 * matches what the companion itself computed. This is what stops a malicious or
 * buggy device from returning a transaction the user never approved.
 */
export async function verifySignedTransaction(
  rawTransaction: string,
  expected: { from: string; hash?: string; request?: EvmTransactionRequest; privateKeyHint?: Uint8Array },
): Promise<{ ok: boolean; from: string; hash: string; reasons: string[] }> {
  const reasons: string[] = [];
  const hash = toHex(keccak_256(hexToBytes(rawTransaction)), true);
  let from = '';
  try {
    from = await recoverTransactionAddress({ serializedTransaction: rawTransaction as Hex } as never);
  } catch (error) {
    reasons.push(`could not recover the sender: ${(error as Error).message}`);
    return { ok: false, from, hash, reasons };
  }
  if (from.toLowerCase() !== expected.from.toLowerCase()) {
    reasons.push(`sender mismatch: recovered ${from}, device claimed ${expected.from}`);
  }
  if (expected.hash !== undefined && hash.toLowerCase() !== expected.hash.toLowerCase()) {
    reasons.push(`hash mismatch: computed ${hash}, device claimed ${expected.hash}`);
  }
  if (expected.request) {
    // Re-derive the payload from the *displayed* fields and compare byte for byte.
    const expectedUnsigned = serializeUnsigned(expected.request);
    const parsed = parseTransaction(rawTransaction as Hex);
    const actualUnsigned = serializeTransaction(
      { ...toViemTransaction(expected.request), ...stripSignature(parsed) } as never,
    ) as string;
    if (expectedUnsigned.toLowerCase() !== actualUnsigned.toLowerCase()) {
      reasons.push('the signed payload does not match the fields shown on the device');
    }
  }
  return { ok: reasons.length === 0, from, hash, reasons };
}

function stripSignature(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object') return {};
  const {
    r: _r,
    s: _s,
    v: _v,
    yParity: _yParity,
    hash: _hash,
    ...rest
  } = parsed as Record<string, unknown>;
  return rest;
}
