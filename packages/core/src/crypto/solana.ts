import { ed25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';
import { NetProofError } from '../errors';
import { concat, utf8 } from '../util/bytes';
import { HARDENED } from './hd';
import { mnemonicToSeed } from './mnemonic';

/**
 * Solana support: ed25519 keys derived the way the Solana ecosystem derives them.
 *
 * Solana is not "another EVM chain". It uses a different curve (ed25519 rather than
 * secp256k1), a different derivation standard (SLIP-0010 rather than BIP32), a
 * different address encoding (base58 of the raw public key, no keccak, no checksum)
 * and a different transaction format. Treating it as a chain id on the EVM path
 * would produce addresses that look fine and hold nothing.
 *
 * SLIP-0010's ed25519 curve only supports *hardened* derivation. That has a
 * consequence worth stating plainly: a Solana account cannot be watched with an
 * account-level xpub the way an EVM account can, because there is no such thing —
 * every level from the master down is hardened. A watch-only Solana wallet therefore
 * receives *addresses*, not extended public keys.
 */

/** SLIP-0010's ed25519 derivation is hardened-only. `HARDENED` comes from ./hd. */
export interface Slip10Node {
  /** 32-byte private key (the seed of an ed25519 keypair). */
  privateKey: Uint8Array;
  /** 32-byte chain code. */
  chainCode: Uint8Array;
  depth: number;
}

function masterNodeFromSeed(seed: Uint8Array): Slip10Node {
  // SLIP-0010: I = HMAC-SHA512(key = "ed25519 seed", data = seed)
  const digest = hmac(sha512, utf8('ed25519 seed'), seed);
  return {
    privateKey: digest.slice(0, 32),
    chainCode: digest.slice(32),
    depth: 0,
  };
}

function deriveHardenedChild(parent: Slip10Node, index: number): Slip10Node {
  if (index < HARDENED) {
    throw new NetProofError(
      'PATH_INVALID',
      'SLIP-0010 ed25519 supports hardened derivation only; use an index with the hardened bit set',
    );
  }
  // SLIP-0010: I = HMAC-SHA512(key = chainCode, data = 0x00 || privateKey || index_be32)
  const data = concat(new Uint8Array([0]), parent.privateKey, u32be(index));
  const digest = hmac(sha512, parent.chainCode, data);
  return {
    privateKey: digest.slice(0, 32),
    chainCode: digest.slice(32),
    depth: parent.depth + 1,
  };
}

function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

/** Parse a Solana-style path such as `m/44'/501'/0'/0'`. */
export function parseSolanaPath(path: string): number[] {
  const trimmed = path.trim().replace(/^m\/?/u, '');
  if (trimmed.length === 0) return [];
  return trimmed.split('/').map((segment) => {
    const hardened = segment.endsWith("'") || segment.endsWith('h') || segment.endsWith('H');
    const digits = hardened ? segment.slice(0, -1) : segment;
    if (!/^\d+$/u.test(digits)) {
      throw new NetProofError('PATH_INVALID', `invalid Solana path segment "${segment}"`);
    }
    const value = Number.parseInt(digits, 10);
    if (value >= HARDENED) {
      throw new NetProofError('PATH_INVALID', `path segment ${segment} is out of range`);
    }
    return hardened ? value + HARDENED : value;
  });
}

export function formatSolanaPath(indices: number[]): string {
  if (indices.length === 0) return 'm';
  return `m/${indices.map((index) => (index >= HARDENED ? `${index - HARDENED}'` : String(index))).join('/')}`;
}

/** Derive a node from a BIP39 seed at a Solana path. */
export function deriveSolanaNode(seed: Uint8Array, path: string): Slip10Node {
  const indices = parseSolanaPath(path);
  let node = masterNodeFromSeed(seed);
  for (const index of indices) {
    node = deriveHardenedChild(node, index);
  }
  return node;
}

export function deriveSolanaKeypair(
  seed: Uint8Array,
  path: string,
): { privateKey: Uint8Array; publicKey: Uint8Array; address: string } {
  const node = deriveSolanaNode(seed, path);
  const publicKey = ed25519.getPublicKey(node.privateKey);
  return { privateKey: node.privateKey, publicKey, address: solanaAddress(publicKey) };
}

/**
 * A Solana address is the base58 of the public key — no prefix, no checksum.
 * A mistyped address is therefore *valid-looking*, which is why the companion must
 * never let a user paste one without the device confirming it.
 */
export function solanaAddress(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new NetProofError('KEY_MISSING_PRIVATE', `Solana public keys are 32 bytes, got ${publicKey.length}`);
  }
  return base58.encode(publicKey);
}

export function isSolanaAddress(value: string): boolean {
  try {
    return base58.decode(value).length === 32;
  } catch {
    return false;
  }
}

/** Sign raw bytes (a serialized transaction) with an ed25519 key. */
export function signSolanaPayload(payload: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new NetProofError('KEY_MISSING_PRIVATE', 'ed25519 private keys are 32 bytes');
  }
  return ed25519.sign(payload, privateKey);
}

export function verifySolanaSignature(
  signature: Uint8Array,
  payload: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, payload, publicKey);
  } catch {
    return false;
  }
}

/** SLIP-44 coin type for Solana. */
export const SOLANA_COIN_TYPE = 501;
/** The path family every Solana wallet uses for its first account. */
export const SOLANA_DEFAULT_PATH = "m/44'/501'/0'/0'";

/** The accounts a companion may discover, matching Phantom/Solflare conventions. */
export function solanaAccountPaths(count = 5): string[] {
  return Array.from({ length: count }, (_, index) => `m/44'/501'/${index}'/0'`);
}

export { mnemonicToSeed };
