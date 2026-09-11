import { sha256 } from '@noble/hashes/sha2.js';
import { NetProofError } from '../errors';
import { concat, crc32, readU32be, toHex, u32be } from '../util/bytes';

/**
 * Luby-Transform fountain code for animated QR transfer over a noisy, one-way
 * optical channel.
 *
 * Why fountain codes: a camera misses frames (blur, glare, the user's hand
 * moving) and sees others twice. A sequential multi-frame protocol needs every
 * frame in order; a rateless code needs *any* ~k(1+ε) frames in any order, so the
 * receiver just keeps scanning until it has enough. That is the difference
 * between "hold steady and hope" and "it just works".
 *
 * Determinism is the whole trick: the set of fragments XORed into frame `i` is a
 * pure function of (message digest, fragment count, i). The sender therefore never
 * has to remember anything, and the receiver can interpret a frame it missed
 * earlier without any extra channel.
 */

/** Deterministic CSPRNG: SHA-256 in counter mode. Reproducible on both sides. */
export class Prng {
  private pool: Uint8Array = new Uint8Array(0);
  private offset = 0;
  private counter = 0;

  constructor(private readonly seed: Uint8Array) {}

  bytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      if (this.offset >= this.pool.length) {
        this.pool = sha256(concat(this.seed, u32be(this.counter++)));
        this.offset = 0;
      }
      out[i] = this.pool[this.offset++];
    }
    return out;
  }

  nextUint32(): number {
    return readU32be(this.bytes(4));
  }

  /** Unbiased integer in [0, maxExclusive) via rejection sampling. */
  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new NetProofError('QR_DECODE_FAILED', `nextInt needs a positive bound, got ${maxExclusive}`);
    }
    if (maxExclusive === 1) return 0;
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    // Expected iterations < 2; the bound keeps a corrupt stream from hanging.
    for (let attempt = 0; attempt < 128; attempt++) {
      const value = this.nextUint32();
      if (value < limit) return value % maxExclusive;
    }
    throw new NetProofError('QR_DECODE_FAILED', 'PRNG failed to produce a usable integer');
  }
}

export interface SolitonOptions {
  /** Degree distribution tuning. BC-UR uses c = 0.1, delta = 0.5; we match. */
  c?: number;
  delta?: number;
}

/**
 * Robust-soliton degree distribution, as a cumulative table.
 * The ideal soliton alone decodes poorly; the robust variant adds a spike at
 * k/R so that a handful of high-degree frames seed the peeling process.
 */
export function degreeDistribution(fragmentCount: number, options: SolitonOptions = {}): number[] {
  const k = Math.max(1, fragmentCount);
  const c = options.c ?? 0.1;
  const delta = options.delta ?? 0.5;
  if (k === 1) return [1];

  const r = c * Math.log(k / delta) * Math.sqrt(k);
  const spike = Math.max(1, Math.min(k, Math.floor(k / r)));

  const weights = new Float64Array(k + 1);
  weights[1] = 1 / k;
  for (let d = 2; d <= k; d++) weights[d] = 1 / (d * (d - 1));
  for (let d = 1; d < spike && d <= k; d++) weights[d] += r / (d * k);
  if (spike <= k) weights[spike] += (r * Math.log(r / delta)) / k;

  let total = 0;
  for (let d = 1; d <= k; d++) total += weights[d];
  if (total <= 0) return [1];

  const cumulative: number[] = new Array(k).fill(0);
  let running = 0;
  for (let d = 1; d <= k; d++) {
    running += weights[d] / total;
    cumulative[d - 1] = running;
  }
  cumulative[k - 1] = 1; // guard against floating-point drift
  return cumulative;
}

function sampleDegree(cumulative: number[], prng: Prng): number {
  const k = cumulative.length;
  if (k === 1) return 1;
  // Draw a 16-bit fraction: enough resolution for the distributions we use.
  const fraction = prng.bytes(2)[0] / 256 + prng.bytes(1)[0] / 65536;
  for (let d = 0; d < k; d++) {
    if (fraction < cumulative[d]) return d + 1;
  }
  return k;
}

/** The fragment indices XORed into a given frame. Pure function of the inputs. */
export function chooseFragments(
  seqNum: number,
  fragmentCount: number,
  messageDigest: Uint8Array,
): number[] {
  if (fragmentCount === 1) return [0];
  const prng = new Prng(concat(messageDigest, u32be(seqNum)));
  const cumulative = degreeDistribution(fragmentCount);
  const degree = Math.min(sampleDegree(cumulative, prng), fragmentCount);
  const chosen = new Set<number>();
  while (chosen.size < degree) chosen.add(prng.nextInt(fragmentCount));
  return [...chosen].sort((a, b) => a - b);
}

export interface FountainFrame {
  seqNum: number;
  fragmentCount: number;
  /**
   * First 4 bytes of the message digest. This is what seeds the encoding plan, and
   * it travels in every frame, so the receiver can reproduce that plan without
   * knowing the message. Encoder and decoder must use these same 4 bytes.
   */
  digestPrefix: Uint8Array;
  /** Message length in bytes, before padding to a fragment boundary. */
  messageLength: number;
  /** The XOR of the chosen fragments; always exactly `fragmentLength` bytes. */
  data: Uint8Array;
}

export interface FountainEncoderOptions {
  /** Bytes of message per fragment. Larger means fewer but denser QR codes. */
  fragmentLength?: number;
}

export class FountainEncoder {
  readonly fragmentCount: number;
  readonly fragmentLength: number;
  readonly messageLength: number;
  /** Full digest, kept for callers that want to verify the payload themselves. */
  readonly digest: Uint8Array;
  /** The 4 digest bytes that seed the encoding plan and travel in every frame. */
  readonly digestPrefix: Uint8Array;
  readonly payload: Uint8Array;
  private readonly fragments: Uint8Array[];

  constructor(payload: Uint8Array, options: FountainEncoderOptions = {}) {
    if (payload.length === 0) {
      throw new NetProofError('QR_FRAME_INVALID', 'cannot fountain-encode an empty payload');
    }
    this.fragmentLength = options.fragmentLength ?? DEFAULT_FRAGMENT_LENGTH;
    if (!Number.isInteger(this.fragmentLength) || this.fragmentLength < 16) {
      throw new NetProofError('QR_FRAME_INVALID', 'fragmentLength must be an integer >= 16');
    }
    this.payload = payload;
    this.messageLength = payload.length;
    this.fragmentCount = Math.ceil(payload.length / this.fragmentLength);
    this.digest = sha256(payload);
    this.digestPrefix = this.digest.subarray(0, 4);

    // Zero-pad the last fragment so every frame is a fixed width.
    const padded = new Uint8Array(this.fragmentCount * this.fragmentLength);
    padded.set(payload);
    this.fragments = [];
    for (let i = 0; i < this.fragmentCount; i++) {
      this.fragments.push(padded.subarray(i * this.fragmentLength, (i + 1) * this.fragmentLength));
    }
  }

  /**
   * Frame `index`. `index` wraps around the message, so a sender can loop an
   * animation forever with `for (i = 0; ; i++) frame(i)` and the receiver never
   * has to know how many frames were generated.
   */
  frame(seqNum: number): FountainFrame {
    const indices = chooseFragments(seqNum, this.fragmentCount, this.digestPrefix);
    const data = new Uint8Array(this.fragmentLength);
    for (const index of indices) {
      const fragment = this.fragments[index];
      for (let i = 0; i < this.fragmentLength; i++) data[i] ^= fragment[i];
    }
    return {
      seqNum,
      fragmentCount: this.fragmentCount,
      digestPrefix: this.digestPrefix,
      messageLength: this.messageLength,
      data,
    };
  }

  /** How many frames a receiver should expect to need in the ideal case. */
  get idealFrameCount(): number {
    return this.fragmentCount;
  }
}

export interface DecoderProgress {
  /** Fragments solved so far. */
  solved: number;
  total: number;
  /** Frames accepted as useful; duplicates and dependencies are not counted. */
  usefulFrames: number;
  /** Frames carrying no new information (repeat scans, fully redundant combos). */
  duplicateFrames: number;
  /** Frames belonging to a different transfer entirely. */
  foreignFrames: number;
  /** True once the payload has been reconstructed and its digest verified. */
  complete: boolean;
}

/**
 * Peeling decoder for the LT code above. Feed it frames in any order, as many
 * times as you like; it returns the payload once enough *independent* frames have
 * arrived.
 */
export class FountainDecoder {
  private readonly fragmentLength: number;
  private readonly digestPrefix: Uint8Array;
  private readonly fragmentCount: number;
  private readonly messageLength: number;
  private readonly solved: (Uint8Array | null)[];
  private readonly equationsByFragment = new Map<number, Set<number>>();
  private equations: { indices: Set<number>; data: Uint8Array; id: string }[] = [];
  private solvedCount = 0;
  private usefulFrames = 0;
  private duplicateFrames = 0;
  private foreignFrames = 0;
  private seenFrameIds = new Set<string>();
  private payload: Uint8Array | null = null;

  constructor(params: {
    fragmentLength: number;
    digestPrefix: Uint8Array;
    fragmentCount: number;
    messageLength: number;
  }) {
    if (params.fragmentCount < 1) {
      throw new NetProofError('QR_FRAME_INVALID', `fragmentCount must be >= 1, got ${params.fragmentCount}`);
    }
    if (params.digestPrefix.length !== 4) {
      throw new NetProofError('QR_FRAME_INVALID', 'the digest prefix must be exactly 4 bytes');
    }
    if (params.messageLength < 1 || params.messageLength > params.fragmentCount * params.fragmentLength) {
      throw new NetProofError('QR_FRAME_INVALID', 'messageLength is inconsistent with the fragment geometry');
    }
    this.fragmentLength = params.fragmentLength;
    this.digestPrefix = params.digestPrefix;
    this.fragmentCount = params.fragmentCount;
    this.messageLength = params.messageLength;
    this.solved = new Array(params.fragmentCount).fill(null);
  }

  static fromFrame(frame: FountainFrame): FountainDecoder {
    return new FountainDecoder({
      fragmentLength: frame.data.length,
      digestPrefix: frame.digestPrefix,
      fragmentCount: frame.fragmentCount,
      messageLength: frame.messageLength,
    });
  }

  get progress(): DecoderProgress {
    return {
      solved: this.solvedCount,
      total: this.fragmentCount,
      usefulFrames: this.usefulFrames,
      duplicateFrames: this.duplicateFrames,
      foreignFrames: this.foreignFrames,
      complete: this.payload !== null,
    };
  }

  /** True when this frame belongs to the same message as the ones seen so far. */
  matches(digestPrefix: Uint8Array): boolean {
    return digestPrefix.length >= 4 && toHex(digestPrefix.subarray(0, 4)) === toHex(this.digestPrefix);
  }

  addFrame(frame: FountainFrame): DecoderProgress {
    if (this.payload !== null) return this.progress; // already done; ignore the rest
    if (!this.matches(frame.digestPrefix)) {
      // A frame from a different transfer: ignore it rather than corrupt state.
      this.foreignFrames++;
      return this.progress;
    }
    if (frame.fragmentCount !== this.fragmentCount || frame.data.length !== this.fragmentLength) {
      throw new NetProofError('QR_FRAME_INVALID', 'frame geometry does not match this decoder');
    }

    const indices = chooseFragments(frame.seqNum, this.fragmentCount, this.digestPrefix);
    const id = indices.join(',');
    // Two frames with the same index set carry identical information.
    const frameId = `${frame.seqNum}:${id}`;
    if (this.seenFrameIds.has(frameId)) {
      this.duplicateFrames++;
      return this.progress;
    }
    this.seenFrameIds.add(frameId);

    // Reduce the incoming frame by every fragment we already know.
    const reduced = new Set<number>();
    const data = frame.data.slice();
    for (const index of indices) {
      const known = this.solved[index];
      if (known) {
        for (let i = 0; i < this.fragmentLength; i++) data[i] ^= known[i];
      } else {
        reduced.add(index);
      }
    }

    if (reduced.size === 0) {
      // Fully redundant: all fragments were already known.
      this.duplicateFrames++;
      return this.progress;
    }
    this.usefulFrames++;

    if (reduced.size === 1) {
      this.solve([...reduced][0], data);
    } else {
      this.addEquation({ indices: reduced, data, id });
    }
    if (this.solvedCount === this.fragmentCount) this.assemble();
    return this.progress;
  }

  /** Reconstruct the payload; throws when the transfer is not complete. */
  result(): Uint8Array {
    if (this.payload === null) this.assemble();
    if (this.payload === null) {
      throw new NetProofError(
        'QR_DECODE_FAILED',
        `transfer incomplete: ${this.solvedCount}/${this.fragmentCount} fragments recovered`,
      );
    }
    return this.payload;
  }

  private solve(index: number, data: Uint8Array): void {
    if (this.solved[index]) return;
    this.solved[index] = data;
    this.solvedCount++;

    // Substitute the newly known fragment into every pending equation.
    const dependents = this.equationsByFragment.get(index);
    if (!dependents) return;
    this.equationsByFragment.delete(index);
    for (const equationIndex of dependents) {
      const equation = this.equations[equationIndex];
      if (!equation || !equation.indices.has(index)) continue;
      for (let i = 0; i < this.fragmentLength; i++) equation.data[i] ^= data[i];
      equation.indices.delete(index);
      if (equation.indices.size === 1) {
        this.removeEquation(equationIndex);
        const last = [...equation.indices][0];
        this.solve(last, equation.data);
      } else if (equation.indices.size === 0) {
        this.removeEquation(equationIndex);
      }
    }
  }

  private addEquation(equation: { indices: Set<number>; data: Uint8Array; id: string }): void {
    const index = this.equations.push(equation) - 1;
    for (const fragment of equation.indices) {
      const bucket = this.equationsByFragment.get(fragment) ?? new Set<number>();
      bucket.add(index);
      this.equationsByFragment.set(fragment, bucket);
    }
  }

  private removeEquation(index: number): void {
    const equation = this.equations[index];
    this.equations[index] = undefined as never;
    if (!equation) return;
    for (const fragment of equation.indices) {
      this.equationsByFragment.get(fragment)?.delete(index);
    }
  }

  private assemble(): void {
    if (this.solvedCount !== this.fragmentCount) return;
    const padded = new Uint8Array(this.fragmentCount * this.fragmentLength);
    for (let i = 0; i < this.fragmentCount; i++) {
      const fragment = this.solved[i];
      if (!fragment) return;
      padded.set(fragment, i * this.fragmentLength);
    }
    const candidate = padded.slice(0, this.messageLength);
    const digest = sha256(candidate);
    if (toHex(digest.subarray(0, 4)) !== toHex(this.digestPrefix)) {
      // Every fragment arrived but the digest disagrees: a scan was accepted that
      // should not have been. Refuse, rather than hand back corrupt bytes.
      throw new NetProofError(
        'QR_CHECKSUM_MISMATCH',
        'reconstructed payload does not match the transmitted digest',
      );
    }
    this.payload = candidate;
  }
}

/**
 * Default fragment size. Frame overhead is 10 bytes (digest, length, CRC) plus the
 * `NP1:TYPE:n-m:` header, and base32 costs 1.6 characters per byte, so 400 bytes
 * lands around 670 characters — comfortably scannable from a phone screen.
 */
export const DEFAULT_FRAGMENT_LENGTH = 400;

/** CRC-32 over the frame header and data, to reject a bad scan immediately. */
export function frameChecksum(header: Uint8Array, data: Uint8Array): number {
  return crc32(concat(header, data));
}
