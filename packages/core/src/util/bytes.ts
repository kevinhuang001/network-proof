import { sha256 } from '@noble/hashes/sha2.js';

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function toText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const HEX = '0123456789abcdef';

export function toHex(bytes: Uint8Array, prefix = false): string {
  let out = prefix ? '0x' : '';
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hex string must have an even length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex at index ${i * 2}`);
    out[i] = byte;
  }
  return out;
}

/** Overwrite a buffer in place. Best effort only: JS may have copied it already. */
export function zeroize(...buffers: (Uint8Array | undefined)[]): void {
  for (const buf of buffers) if (buf) buf.fill(0);
}

/**
 * Domain-separated hash: `sha256(len(tag) || tag || parts...)`.
 * The untyped concatenation of BIP39 passphrases, paths and passwords is a classic
 * source of cross-protocol confusion, so every digest in this codebase is tagged.
 */
export function taggedHash(tag: string, ...parts: Uint8Array[]): Uint8Array {
  const tagBytes = utf8(tag);
  const lenPrefix = new Uint8Array([(tagBytes.length >> 8) & 0xff, tagBytes.length & 0xff]);
  return sha256(concat(lenPrefix, tagBytes, ...parts));
}

/** Big-endian uint32 encoding, the only integer width used by the wire formats. */
export function u32be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`u32be out of range: ${value}`);
  }
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

export function readU32be(bytes: Uint8Array, offset = 0): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE 802.3). Used to drop corrupt QR scans early. Not a security primitive. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Cryptographically strong random bytes from the host CSPRNG. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) value = (value << 8n) | BigInt(bytes[i]);
  return value;
}

export function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('bigint does not fit in the requested length');
  return out;
}
