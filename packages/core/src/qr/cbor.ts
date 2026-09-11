import { NetProofError } from '../errors';
import { concat, fromHex, toHex, utf8 } from '../util/bytes';

/**
 * Minimal deterministic CBOR (RFC 8949) codec for the air-gap wire format.
 *
 * Design constraints, in order of importance:
 *  1. Deterministic: maps are always emitted with their keys sorted bytewise, so
 *     the same logical message always produces the same bytes. Both sides can
 *     therefore hash a request and compare digests.
 *  2. Integer-exact: no floating point whatsoever. Values larger than 2^64 are
 *     carried as byte strings (`bytes32` / `biguint`), which is how EVM quantities
 *     travel. A hardware wallet must never see a rounded number.
 *  3. Tiny: no dependency, and only the six major types we actually use.
 *
 * Unsupported on purpose: indefinite-length items, floats, tags, and maps with
 * non-text keys. Trying to use them throws rather than silently guessing.
 */
export type CborValue =
  | number
  | bigint
  | string
  | Uint8Array
  | boolean
  | null
  | CborValue[]
  | { [key: string]: CborValue };

const MAJOR_UNSIGNED = 0;
const MAJOR_NEGATIVE = 1;
const MAJOR_BYTES = 2;
const MAJOR_TEXT = 3;
const MAJOR_ARRAY = 4;
const MAJOR_MAP = 5;
const MAJOR_SIMPLE = 7;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function encodeCbor(value: CborValue): Uint8Array {
  const chunks: Uint8Array[] = [];
  encodeInto(value, chunks);
  return concat(...chunks);
}

function encodeInto(value: CborValue, out: Uint8Array[]): void {
  if (value === null) {
    out.push(new Uint8Array([0xe0 | 22]));
    return;
  }
  switch (typeof value) {
    case 'boolean':
      out.push(new Uint8Array([0xe0 | (value ? 21 : 20)]));
      return;
    case 'number': {
      if (!Number.isInteger(value)) {
        throw new NetProofError('CBOR_INVALID', `CBOR refuses non-integer numbers: ${value}`);
      }
      encodeInteger(BigInt(value), out);
      return;
    }
    case 'bigint':
      encodeInteger(value, out);
      return;
    case 'string':
      out.push(encodeHead(MAJOR_TEXT, BigInt(utf8(value).length)), utf8(value));
      return;
    case 'object': {
      if (value instanceof Uint8Array) {
        out.push(encodeHead(MAJOR_BYTES, BigInt(value.length)), value);
        return;
      }
      if (Array.isArray(value)) {
        out.push(encodeHead(MAJOR_ARRAY, BigInt(value.length)));
        for (const item of value) encodeInto(item, out);
        return;
      }
      const keys = Object.keys(value);
      // Bytewise sort by encoded key: required for a canonical encoding.
      const encodedKeys = keys.map((key) => ({ key, bytes: utf8(key) }));
      encodedKeys.sort((a, b) => compareBytes(a.bytes, b.bytes));
      out.push(encodeHead(MAJOR_MAP, BigInt(encodedKeys.length)));
      for (const { key, bytes } of encodedKeys) {
        out.push(encodeHead(MAJOR_TEXT, BigInt(bytes.length)), bytes);
        encodeInto(value[key] as CborValue, out);
      }
      return;
    }
    default:
      throw new NetProofError('CBOR_INVALID', `unsupported CBOR value type: ${typeof value}`);
  }
}

function encodeInteger(value: bigint, out: Uint8Array[]): void {
  if (value >= 0n) {
    out.push(encodeHead(MAJOR_UNSIGNED, value));
    return;
  }
  out.push(encodeHead(MAJOR_NEGATIVE, -value - 1n));
}

function encodeHead(major: number, argument: bigint): Uint8Array {
  const prefix = major << 5;
  if (argument < 24n) return new Uint8Array([prefix | Number(argument)]);
  if (argument <= 0xffn) return new Uint8Array([prefix | 24, Number(argument)]);
  if (argument <= 0xffffn) {
    return new Uint8Array([prefix | 25, Number(argument >> 8n) & 0xff, Number(argument) & 0xff]);
  }
  if (argument <= 0xffffffffn) {
    const bytes = new Uint8Array(5);
    bytes[0] = prefix | 26;
    new DataView(bytes.buffer).setUint32(1, Number(argument), false);
    return bytes;
  }
  if (argument <= 0xffffffffffffffffn) {
    const bytes = new Uint8Array(9);
    bytes[0] = prefix | 27;
    new DataView(bytes.buffer).setBigUint64(1, argument, false);
    return bytes;
  }
  throw new NetProofError(
    'CBOR_INVALID',
    'integers above 2^64-1 must be encoded as byte strings, not CBOR integers',
  );
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const reader = new CborReader(bytes);
  const value = reader.readValue();
  if (reader.offset !== bytes.length) {
    throw new NetProofError('CBOR_INVALID', `trailing bytes after CBOR item at offset ${reader.offset}`);
  }
  return value;
}

class CborReader {
  offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  readValue(): CborValue {
    const initial = this.readByte();
    const major = initial >> 5;
    const info = initial & 0x1f;
    switch (major) {
      case MAJOR_UNSIGNED:
        return normalizeInteger(this.readArgument(info));
      case MAJOR_NEGATIVE:
        return normalizeInteger(-this.readArgument(info) - 1n);
      case MAJOR_BYTES:
        return this.readBytes(Number(this.readArgument(info)));
      case MAJOR_TEXT:
        return new TextDecoder().decode(this.readBytes(Number(this.readArgument(info))));
      case MAJOR_ARRAY: {
        const length = Number(this.readArgument(info));
        const out: CborValue[] = [];
        for (let i = 0; i < length; i++) out.push(this.readValue());
        return out;
      }
      case MAJOR_MAP: {
        const length = Number(this.readArgument(info));
        const out: Record<string, CborValue> = {};
        for (let i = 0; i < length; i++) {
          const key = this.readValue();
          if (typeof key !== 'string') {
            throw new NetProofError('CBOR_INVALID', 'only text keys are supported in CBOR maps');
          }
          if (Object.hasOwn(out, key)) {
            throw new NetProofError('CBOR_INVALID', `duplicate CBOR map key: ${key}`);
          }
          out[key] = this.readValue();
        }
        return out;
      }
      case MAJOR_SIMPLE:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new NetProofError(
          'CBOR_INVALID',
          `unsupported simple/float value (info=${info}); the wire format is integer-only`,
        );
      default:
        throw new NetProofError('CBOR_INVALID', `unsupported CBOR major type ${major}`);
    }
  }

  private readArgument(info: number): bigint {
    if (info < 24) return BigInt(info);
    if (info === 24) return BigInt(this.readByte());
    if (info === 25) {
      const view = this.readBytes(2);
      return BigInt((view[0] << 8) | view[1]);
    }
    if (info === 26) {
      const view = this.readBytes(4);
      return BigInt(new DataView(view.buffer, view.byteOffset, 4).getUint32(0, false));
    }
    if (info === 27) {
      const view = this.readBytes(8);
      return new DataView(view.buffer, view.byteOffset, 8).getBigUint64(0, false);
    }
    if (info === 31) {
      throw new NetProofError(
        'CBOR_INVALID',
        'indefinite-length items are not supported; lengths must be known up front',
      );
    }
    throw new NetProofError('CBOR_INVALID', `reserved additional information value ${info}`);
  }

  private readByte(): number {
    if (this.offset >= this.bytes.length) {
      throw new NetProofError('CBOR_INVALID', 'unexpected end of CBOR input');
    }
    return this.bytes[this.offset++];
  }

  private readBytes(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new NetProofError('CBOR_INVALID', `CBOR item needs ${length} bytes but only ${this.bytes.length - this.offset} remain`);
    }
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

/**
 * Numbers within the safe range decode to `number`; anything larger stays a
 * `bigint` rather than being silently rounded. The encoder accepts bigints up to
 * 2^64-1, so the decoder must be able to read them back — an asymmetric codec
 * would be a correctness trap.
 */
function normalizeInteger(value: bigint): number | bigint {
  if (value > MAX_SAFE || value < -MAX_SAFE) return value;
  return Number(value);
}

/**
 * Exact big-endian byte-string encoding for EVM quantities (uint256, wei, gas).
 * Always 32 bytes so the wire representation is a fixed width and cannot be
 * confused with a shorter value.
 */
export function uint256ToBytes(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 256n) {
    throw new NetProofError('CBOR_INVALID', `value out of uint256 range: ${value}`);
  }
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function bytesToUint256(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new NetProofError('CBOR_INVALID', `expected a 32-byte quantity, got ${bytes.length}`);
  }
  let value = 0n;
  for (let i = 0; i < 32; i++) value = (value << 8n) | BigInt(bytes[i]);
  return value;
}

/** Hex string to byte string, for the addresses and calldata on the wire. */
export function hexToCborBytes(hex: string): Uint8Array {
  return fromHex(hex);
}

export function cborBytesToHex(bytes: Uint8Array): string {
  return toHex(bytes, true);
}
