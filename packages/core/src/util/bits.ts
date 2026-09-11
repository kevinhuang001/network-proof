/**
 * Bit-level helpers shared by the entropy extractor and the fountain code.
 * A `Uint8Array` holding values 0/1 per element is a "bit array" here; packed
 * bytes always use least-significant-bit-first ordering within each byte.
 */

export class BitWriter {
  private buffer: Uint8Array;
  private bitLength = 0;

  constructor(capacityBits = 1024) {
    this.buffer = new Uint8Array(Math.max(1, Math.ceil(capacityBits / 8)));
  }

  get length(): number {
    return this.bitLength;
  }

  push(bit: number): void {
    if (bit !== 0 && bit !== 1) throw new Error(`bit must be 0 or 1, got ${bit}`);
    const byteIndex = this.bitLength >>> 3;
    if (byteIndex >= this.buffer.length) {
      const grown = new Uint8Array(this.buffer.length * 2);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    if (bit === 1) this.buffer[byteIndex] |= 1 << (this.bitLength & 7);
    this.bitLength++;
  }

  pushBits(bits: ArrayLike<number>): void {
    for (let i = 0; i < bits.length; i++) this.push(bits[i]);
  }

  /** Packed bytes, LSB-first within each byte. Trailing bits are zero-padded. */
  toBytes(): Uint8Array {
    return this.buffer.slice(0, Math.ceil(this.bitLength / 8));
  }
}

/** Unpack `count` bits starting at `offset`, LSB-first within each byte. */
export function unpackBits(bytes: Uint8Array, offset = 0, count = bytes.length * 8 - offset): number[] {
  const bits: number[] = [];
  for (let i = 0; i < count; i++) {
    const index = offset + i;
    bits.push((bytes[index >>> 3] >>> (index & 7)) & 1);
  }
  return bits;
}

export function countOnes(bytes: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < bytes.length; i++) {
    let v = bytes[i];
    while (v) {
      total += v & 1;
      v >>>= 1;
    }
  }
  return total;
}

/**
 * Von Neumann debiasing: consume the raw bit stream in non-overlapping pairs and
 * emit one bit for every disagreeing pair (01 -> 0, 10 -> 1), discarding agree
 * pairs. The output is unbiased regardless of the input bias, as long as the
 * bits are independent and identically distributed — which is why we also run
 * runs/monobit/block tests on the result rather than trusting this blindly.
 */
export function vonNeumannDebias(bits: ArrayLike<number>): { bits: Uint8Array; discarded: number } {
  const out: number[] = [];
  let discarded = 0;
  const pairs = bits.length - (bits.length % 2);
  for (let i = 0; i < pairs; i += 2) {
    const a = bits[i];
    const b = bits[i + 1];
    if (a === b) discarded += 2;
    else out.push(a === 0 ? 0 : 1);
  }
  if (bits.length % 2 === 1) discarded += 1;
  return { bits: Uint8Array.from(out), discarded };
}

/**
 * Most Common Value min-entropy estimate from NIST SP 800-90B (§6.3.1).
 * Returns bits of min-entropy per byte, using the 99% upper confidence bound on
 * the most common value's probability so that short samples are not over-trusted.
 */
export function mcvMinEntropyPerByte(bytes: Uint8Array): {
  phat: number;
  pUpper: number;
  minEntropyPerByte: number;
} {
  if (bytes.length < 2) throw new Error('mcvMinEntropyPerByte needs at least 2 samples');
  const counts = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
  let max = 0;
  for (let i = 0; i < 256; i++) if (counts[i] > max) max = counts[i];
  const phat = max / bytes.length;
  const z = 2.5758293035489004; // 99% two-sided normal quantile
  const pUpper = Math.min(1, phat + z * Math.sqrt((phat * (1 - phat)) / (bytes.length - 1)));
  return { phat, pUpper, minEntropyPerByte: pUpper >= 1 ? 0 : -Math.log2(pUpper) };
}
