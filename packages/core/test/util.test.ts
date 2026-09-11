import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  bigIntToBytes,
  bytesToBigInt,
  concat,
  crc32,
  fromHex,
  readU32be,
  taggedHash,
  toHex,
  u32be,
  utf8,
} from '../src/util/bytes';
import { BitWriter, countOnes, mcvMinEntropyPerByte, unpackBits, vonNeumannDebias } from '../src/util/bits';
import { chiSquarePValue, erfc, gammaQ, logGamma, pValueFromNormal } from '../src/util/stats';

describe('bytes', () => {
  it('round-trips hex', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xff, 0xa5]);
    expect(toHex(bytes)).toBe('000fffa5');
    expect(toHex(bytes, true)).toBe('0x000fffa5');
    expect(fromHex('0x000fffa5')).toEqual(bytes);
    expect(fromHex('000FFFA5')).toEqual(bytes);
  });

  it('rejects malformed hex', () => {
    expect(() => fromHex('abc')).toThrow(/even length/);
    expect(() => fromHex('zz')).toThrow(/invalid hex/);
  });

  it('concatenates and compares', () => {
    expect(toHex(concat(new Uint8Array([1]), new Uint8Array([2, 3])))).toBe('010203');
  });

  it('encodes uint32 big-endian', () => {
    expect(toHex(u32be(0x01020304))).toBe('01020304');
    expect(readU32be(u32be(0xffffffff))).toBe(0xffffffff);
    expect(readU32be(u32be(0), 0)).toBe(0);
    expect(() => u32be(-1)).toThrow();
    expect(() => u32be(2 ** 32)).toThrow();
  });

  it('converts to and from bigint', () => {
    const bytes = fromHex('0000000000000000000000000000000000000000000000000000000000000001');
    expect(bytesToBigInt(bytes)).toBe(1n);
    expect(toHex(bigIntToBytes(0xdeadbeefn, 4))).toBe('deadbeef');
    expect(() => bigIntToBytes(0x1ffffn, 2)).toThrow(/does not fit/);
  });

  it('computes the standard CRC-32 check value', () => {
    // The canonical CRC-32/ISO-HDLC check value for "123456789".
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(utf8('123456789'), 0x12345678)).not.toBe(0xcbf43926);
  });

  it('separates hash domains by tag', () => {
    const a = taggedHash('a', utf8('x'));
    const b = taggedHash('b', utf8('x'));
    expect(toHex(a)).not.toBe(toHex(b));
    expect(a.length).toBe(32);
    // The length prefix prevents ("ab","") colliding with ("a","b").
    expect(toHex(taggedHash('ab'))).not.toBe(toHex(taggedHash('a', utf8('b'))));
    // Matches a manual construction of the documented layout.
    const manual = sha256(concat(new Uint8Array([0, 1]), utf8('a'), utf8('x')));
    expect(toHex(taggedHash('a', utf8('x')))).toBe(toHex(manual));
  });
});

describe('bits', () => {
  it('packs bits LSB-first', () => {
    const writer = new BitWriter(4);
    writer.push(1);
    writer.push(0);
    writer.push(1);
    writer.push(1);
    expect(writer.length).toBe(4);
    expect(toHex(writer.toBytes())).toBe('0d');
  });

  it('grows beyond its initial capacity', () => {
    const writer = new BitWriter(1);
    for (let i = 0; i < 40; i++) writer.push(i % 2);
    expect(writer.length).toBe(40);
    expect(writer.toBytes().length).toBe(5);
  });

  it('round-trips unpackBits', () => {
    const writer = new BitWriter(10);
    const original = [1, 0, 0, 1, 1, 1, 0, 1, 0, 1];
    writer.pushBits(original);
    expect(unpackBits(writer.toBytes(), 0, 10)).toEqual(original);
  });

  it('counts ones', () => {
    expect(countOnes(new Uint8Array([0xff, 0x00, 0x0f]))).toBe(12);
  });

  it('rejects non-binary input', () => {
    const writer = new BitWriter(8);
    expect(() => writer.push(2)).toThrow(/bit must be 0 or 1/);
  });

  describe('vonNeumannDebias', () => {
    it('handles the four pair cases and counts discards', () => {
      // 0,1 -> 0 ; 1,0 -> 1 ; 0,0 -> discard ; 1,1 -> discard
      const { bits, discarded } = vonNeumannDebias([0, 1, 1, 0, 0, 0, 1, 1]);
      expect(Array.from(bits)).toEqual([0, 1]);
      expect(discarded).toBe(4);
    });

    it('discards a dangling final bit', () => {
      const { bits, discarded } = vonNeumannDebias([0, 1, 0]);
      expect(Array.from(bits)).toEqual([0]);
      expect(discarded).toBe(1);
    });

    it('removes a strong bias from an i.i.d. source', () => {
      // p(1) = 0.9 source: raw ones fraction 0.9, debiased must be ~0.5.
      const raw: number[] = [];
      let state = 12345;
      const next = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      for (let i = 0; i < 20000; i++) raw.push(next() < 0.9 ? 1 : 0);
      const rawOnes = raw.reduce((a, b) => a + b, 0) / raw.length;
      const { bits } = vonNeumannDebias(raw);
      const debiasedOnes = Array.from(bits).reduce((a, b) => a + b, 0) / bits.length;
      expect(rawOnes).toBeGreaterThan(0.85);
      expect(Math.abs(debiasedOnes - 0.5)).toBeLessThan(0.03);
    });

    it('yields nothing for a constant stream', () => {
      const { bits } = vonNeumannDebias(new Array(1000).fill(1));
      expect(bits.length).toBe(0);
    });
  });

  describe('mcvMinEntropyPerByte', () => {
    it('credits close to 8 bits for uniform bytes', () => {
      const bytes = new Uint8Array(65536);
      for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
      const { phat, pUpper, minEntropyPerByte } = mcvMinEntropyPerByte(bytes);
      // 256 samples of each of 256 values: the point estimate is 1/256, and the
      // 99% confidence bound legitimately costs a couple of tenths of a bit.
      expect(phat).toBeCloseTo(1 / 256, 12);
      expect(pUpper).toBeGreaterThan(phat);
      expect(minEntropyPerByte).toBeGreaterThan(7.7);
      expect(minEntropyPerByte).toBeLessThan(8);
    });

    it('credits ~0 bits for a constant stream', () => {
      const { minEntropyPerByte } = mcvMinEntropyPerByte(new Uint8Array(4096).fill(7));
      expect(minEntropyPerByte).toBeLessThan(0.01);
    });

    it('is conservative for small samples', () => {
      // 2 samples can never claim much entropy, whatever they are.
      const { minEntropyPerByte } = mcvMinEntropyPerByte(new Uint8Array([1, 2]));
      expect(minEntropyPerByte).toBeLessThan(2);
    });

    it('requires at least two samples', () => {
      expect(() => mcvMinEntropyPerByte(new Uint8Array([1]))).toThrow();
    });
  });
});

describe('stats', () => {
  it('matches known erfc values', () => {
    expect(erfc(0)).toBeCloseTo(1, 10);
    expect(erfc(1)).toBeCloseTo(0.15729920705028513, 7);
    expect(erfc(2)).toBeCloseTo(0.004677734981047266, 9);
    expect(erfc(-1)).toBeCloseTo(2 - 0.15729920705028513, 7);
    expect(erfc(3)).toBeCloseTo(2.209049699858544e-5, 10);
  });

  it('matches known logGamma values', () => {
    expect(logGamma(1)).toBeCloseTo(0, 12);
    expect(logGamma(2)).toBeCloseTo(0, 12);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    expect(logGamma(10.5)).toBeCloseTo(13.940625219403763, 8);
  });

  it('evaluates the chi-square survival function', () => {
    // Closed form for 2 degrees of freedom: Q = exp(-x/2).
    expect(chiSquarePValue(6, 2)).toBeCloseTo(Math.exp(-3), 12);
    expect(chiSquarePValue(0, 2)).toBeCloseTo(1, 12);
    // Classic critical value: chi2 = 310.457 for df = 255 at alpha = 0.01.
    expect(chiSquarePValue(310.45739, 255)).toBeCloseTo(0.01, 4);
    // df = 1 reduces to the two-sided normal p-value of sqrt(x).
    expect(chiSquarePValue(1, 1)).toBeCloseTo(pValueFromNormal(1), 8);
  });

  it('keeps gammaQ inside [0,1]', () => {
    for (const [a, x] of [
      [0.5, 1e-8],
      [1, 1],
      [2.5, 40],
      [255 / 2, 310.45739],
      [100, 1e6],
    ] as const) {
      const value = gammaQ(a, x);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
