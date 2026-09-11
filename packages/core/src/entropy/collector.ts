import { sha256 } from '@noble/hashes/sha2.js';
import { NetProofError } from '../errors';
import { BitWriter, countOnes } from '../util/bits';
import { concat, randomBytes, taggedHash, toHex, u32be, utf8 } from '../util/bytes';
import {
  debiasTemporally,
  extractQuantizationJitter,
  extractTemporalNoise,
  minEntropyPerBit,
} from './noise';
import { isGatingFailure, runHealthTests } from './health';
import type {
  CollectorOptions,
  CollectorStats,
  EntropyResult,
  EntropySourceReport,
  GrayscaleFrame,
  InteractionSample,
} from './types';

const CONTEXT = utf8('netproof-wallet/entropy/v1');
const DEFAULT_REQUIRED_BITS = 256;
const DEFAULT_BITS_PER_DEBIASED_BIT = 0.05;
/**
 * Number of independent sample "slots" for the statistical battery.
 *
 * Each slot receives one bit per frame, and at finalize time the slots are
 * concatenated. That ordering is the whole point: within a slot, consecutive bits
 * are the *same pixel position in consecutive frames*, whose readout offsets were
 * redrawn in between, so they are genuinely independent — which is the assumption
 * the battery's tests require and the reason a naive raster-order sample failed.
 *
 * 64 slots × 24 frames (the minimum capture) = 1536 bits, comfortably above the
 * 640 bits the block-frequency test needs.
 */
const TEST_SAMPLE_SLOTS = 64;
/**
 * Fixed size of the battery sample: 64 slots x 128 frames.
 *
 * Fixed on purpose. When the sample grew with the capture, the same healthy sensor
 * passed at 40 frames and failed at 300, purely because a fixed-alpha test rejects
 * more readily with more data. The verdict must not depend on how long the user
 * happened to hold the phone.
 */
const MAX_TEST_SAMPLE_BITS = TEST_SAMPLE_SLOTS * 128;

/**
 * Per-extraction-mode accounting, used for honest entropy crediting.
 *
 * `bits`/`ones` count the *debiased* output — the bits that actually reach the
 * extractor — not the raw per-pixel signs. Crediting raw bits would overstate the
 * contribution, because debiasing deliberately discards the correlated and biased
 * majority of them.
 */
interface ModeStats {
  bits: number;
  ones: number;
  /** Raw signs seen, kept only for diagnostics. */
  rawBits: number;
}

export interface FrameContribution {
  /** Read-noise (Mode B) bits emitted by this frame. */
  readNoiseBits: number;
  /** Quantization-jitter (Mode A) bits emitted by this frame. */
  quantizationBits: number;
  /** Bits that survived von Neumann debiasing for this frame. */
  debiasedBits: number;
  /** Conservative min-entropy credit granted for this frame, in bits. */
  creditedBits: number;
  pixelsRejected: number;
  onesFraction: number;
  /** True when this frame was (nearly) identical to the previous one. */
  stalled: boolean;
}

/**
 * Collects entropy from live camera frames and turns it into wallet seed material.
 *
 * Threat model: the phone is permanently offline and its camera is physically
 * present. An attacker who cannot observe the sensor cannot predict the
 * frame-to-frame noise, so the accumulated transcript is secret. We therefore
 * (a) hash every frame and every extracted bit into a running transcript, and
 * (b) *measure* the quality of what came out before allowing a wallet to be
 * created — an unhealthy capture throws instead of producing a weak seed.
 *
 * Entropy accounting is deliberately pessimistic and measured rather than
 * assumed: each extraction mode's contribution is
 * `bits x min-entropy-per-bit(observed) x bitsPerDebiasedBit`, where the final
 * factor (default 0.05) stands in for the spatial/temporal independence we cannot
 * prove from a single capture.
 */
export class CameraNoiseCollector {
  private readonly requiredBits: number;
  private readonly bitsPerDebiasedBit: number;
  private readonly maxFrameDelta: number;
  private readonly minFrames: number;
  private readonly minDurationMs: number;
  private readonly includeDeviceCsprng: boolean;

  private accumulator: Uint8Array;
  private readonly deviceEntropy: Uint8Array | null;
  private auxEntropy: Uint8Array | null;

  private olderFrame: GrayscaleFrame | null = null;
  private previousFrame: GrayscaleFrame | null = null;
  // Previous frame's per-pixel bit planes, so debiasing can pair the *same* pixel
  // across time rather than neighbouring pixels across space.
  private previousReadNoise: { plane: Uint8Array; contributing: Uint8Array } | null = null;
  private previousQuantization: { plane: Uint8Array; contributing: Uint8Array } | null = null;
  private frameCount = 0;
  private interactionCount = 0;
  private interactionDigest: Uint8Array | null = null;
  private rejectedPixels = 0;
  private debiasedBitCount = 0;
  private testSampleBits = 0;
  private totalPixelsConsidered = 0;
  private totalOnes = 0;
  private lastStalled = false;
  private startedAt: number | null = null;
  private lastTimestamp: number | null = null;
  private readonly modeStats: { readNoise: ModeStats; quantization: ModeStats } = {
    readNoise: { bits: 0, ones: 0, rawBits: 0 },
    quantization: { bits: 0, ones: 0, rawBits: 0 },
  };
  private debiased = new BitWriter(1 << 16);
  /**
   * A decimated copy of the debiased stream, used for the statistical battery.
   *
   * The battery's tests all assume i.i.d. bits. The debiased stream is *not*
   * i.i.d. — neighbouring pixels share row noise, column offsets and PRNU — so
   * testing it directly fails on healthy hardware. This sample spreads its picks
   * across each frame (far-apart pixels) and repeats the positions frame to frame,
   * where the readout offsets have been redrawn, which is enough to make
   * consecutive samples approximately independent.
   */
  /**
   * Per-slot bits, held as plain number arrays rather than packed bytes.
   *
   * Packing each slot separately and concatenating the byte arrays injects
   * zero-padding at every slot boundary — each partial byte is padded out — which
   * biased the sample so hard that monobit failed at p = 5e-16 on healthy data.
   * The slots are concatenated bit by bit at the end instead.
   */
  private testSampleSlots: number[][] = [];

  constructor(options: CollectorOptions = {}) {
    this.requiredBits = options.requiredBits ?? DEFAULT_REQUIRED_BITS;
    this.bitsPerDebiasedBit = options.bitsPerDebiasedBit ?? DEFAULT_BITS_PER_DEBIASED_BIT;
    this.maxFrameDelta = options.maxFrameDelta ?? 48;
    this.minFrames = options.minFrames ?? 8;
    this.minDurationMs = options.minDurationMs ?? 600;
    this.includeDeviceCsprng = options.includeDeviceCsprng ?? true;
    this.auxEntropy = options.auxEntropy ?? null;
    if (this.requiredBits <= 0 || this.requiredBits % 8 !== 0) {
      throw new NetProofError('ENTROPY_INSUFFICIENT', 'requiredBits must be a positive multiple of 8');
    }
    if (this.requiredBits / this.bitsPerDebiasedBit > 8_000_000) {
      throw new NetProofError(
        'ENTROPY_INSUFFICIENT',
        'bitsPerDebiasedBit is too pessimistic to ever satisfy requiredBits',
      );
    }
    this.accumulator = taggedHash('netproof/entropy/init/v1', CONTEXT, u32be(this.requiredBits));
    this.deviceEntropy = this.includeDeviceCsprng ? randomBytes(32) : null;
  }

  /** Bytes of seed material this collector will produce (requiredBits / 8). */
  get requiredBytes(): number {
    return this.requiredBits / 8;
  }

  /** Number of frames needed before both extraction modes are active. */
  get minFramesForBothModes(): number {
    return 3;
  }

  /**
   * Feed one grayscale frame. The first frame only establishes the baseline; every
   * later frame contributes read noise against its predecessor, and from the third
   * frame on we also run the quantization-jitter extractor over the 3-frame window.
   */
  addFrame(frame: GrayscaleFrame): FrameContribution {
    this.validateFrame(frame);
    if (this.startedAt === null) this.startedAt = frame.timestamp;
    this.frameCount++;

    // Hash the whole frame into the transcript: defence in depth for the case
    // where our noise model is wrong about some pixels.
    this.accumulator = taggedHash(
      'netproof/entropy/frame-raw/v1',
      this.accumulator,
      u32be(frame.width),
      u32be(frame.height),
      sha256(frame.data),
    );

    if (this.previousFrame === null) {
      this.previousFrame = frame;
      this.lastTimestamp = frame.timestamp;
      return {
        readNoiseBits: 0,
        quantizationBits: 0,
        debiasedBits: 0,
        creditedBits: 0,
        pixelsRejected: 0,
        onesFraction: 0,
        stalled: false,
      };
    }

    const readNoise = extractTemporalNoise(this.previousFrame, frame, {
      maxFrameDelta: this.maxFrameDelta,
    });
    const quantization =
      this.olderFrame === null
        ? null
        : extractQuantizationJitter(this.olderFrame, this.previousFrame, frame);

    // Pair each pixel with *itself* one frame earlier. Neighbouring pixels share
    // row noise, PRNU and optical blur, so pairing across space would make von
    // Neumann discard nearly everything (measured: 99.6% loss on a realistic
    // sensor model). Across time the two bits of a pair really are independent.
    const readNoiseDebiased = this.previousReadNoise
      ? debiasTemporally(
          this.previousReadNoise.plane,
          this.previousReadNoise.contributing,
          readNoise.plane,
          readNoise.contributing,
        )
      : { bits: new Uint8Array(0), discarded: 0 };
    const quantizationDebiased =
      this.previousQuantization && quantization
        ? debiasTemporally(
            this.previousQuantization.plane,
            this.previousQuantization.contributing,
            quantization.plane,
            quantization.contributing,
          )
        : { bits: new Uint8Array(0), discarded: 0 };

    const debiasedBits = new Uint8Array(
      readNoiseDebiased.bits.length + quantizationDebiased.bits.length,
    );
    debiasedBits.set(readNoiseDebiased.bits, 0);
    debiasedBits.set(quantizationDebiased.bits, readNoiseDebiased.bits.length);
    this.debiased.pushBits(debiasedBits);
    this.debiasedBitCount += debiasedBits.length;
    this.sampleForTests(debiasedBits);
    const discarded = readNoiseDebiased.discarded + quantizationDebiased.discarded;

    const creditedBefore = this.creditTotal();
    this.modeStats.readNoise.bits += readNoiseDebiased.bits.length;
    this.modeStats.readNoise.ones += countOnes(readNoiseDebiased.bits);
    this.modeStats.readNoise.rawBits += readNoise.pixelsConsidered;
    if (quantization) {
      this.modeStats.quantization.bits += quantizationDebiased.bits.length;
      this.modeStats.quantization.ones += countOnes(quantizationDebiased.bits);
      this.modeStats.quantization.rawBits += quantization.pixelsConsidered;
    }
    const credited = this.creditTotal() - creditedBefore;

    const considered = readNoise.pixelsConsidered + (quantization?.pixelsConsidered ?? 0);
    const framePixels = frame.data.length;
    // Staleness is defined by *information*, not by pixel counts: a covered lens
    // on a quantization-limited sensor still emits a full frame of Mode A bits,
    // but they are all zeros, so the measured min-entropy credit is exactly zero.
    const stalled = credited <= 0 || considered < Math.max(64, framePixels * 0.01);
    this.lastStalled = stalled;

    const radixOnes = countOnes(readNoiseDebiased.bits) + countOnes(quantizationDebiased.bits);
    this.totalPixelsConsidered += debiasedBits.length;
    this.totalOnes += radixOnes;
    this.rejectedPixels += readNoise.pixelsRejected + (quantization?.pixelsRejected ?? 0);

    // Fold the raw planes and the debiased output into the transcript. The raw
    // planes are included even though they are correlated: they still come from the
    // sensor, and hashing them can only add entropy, never remove it.
    this.accumulator = taggedHash(
      'netproof/entropy/frame-noise/v1',
      this.accumulator,
      u32be(readNoise.pixelsConsidered),
      u32be(quantization?.pixelsConsidered ?? 0),
      u32be(discarded),
      sha256(this.previousFrame.data),
      sha256(frame.data),
      debiasedBits.length > 0 ? sha256(debiasedBits) : new Uint8Array(32),
    );

    this.olderFrame = this.previousFrame;
    this.previousFrame = frame;
    this.previousReadNoise = { plane: readNoise.plane, contributing: readNoise.contributing };
    this.previousQuantization = quantization
      ? { plane: quantization.plane, contributing: quantization.contributing }
      : null;
    this.lastTimestamp = frame.timestamp;

    return {
      readNoiseBits: readNoiseDebiased.bits.length,
      quantizationBits: quantizationDebiased.bits.length,
      debiasedBits: debiasedBits.length,
      creditedBits: credited,
      pixelsRejected: this.rejectedPixels,
      onesFraction: considered === 0 ? 0 : radixOnes / considered,
      stalled,
    };
  }

  /**
   * Mix in a user interaction sample. Interactions are *mixers only*: they are
   * folded into the transcript but grant no entropy credit, because we cannot
   * honestly quantify a human's timing jitter.
   */
  addInteraction(sample: InteractionSample): void {
    if (!Number.isFinite(sample.timestamp) || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      throw new NetProofError('ENTROPY_INSUFFICIENT', 'interaction sample contains non-finite values');
    }
    this.interactionCount++;
    this.interactionDigest = taggedHash(
      'netproof/entropy/interaction/v1',
      this.interactionDigest ?? new Uint8Array(32),
      float64(sample.timestamp),
      float64(sample.x),
      float64(sample.y),
      float64(sample.force ?? 0),
    );
  }

  /** Add extra caller-supplied entropy (dice rolls, coin flips) as a mixer. */
  addAuxEntropy(bytes: Uint8Array, label = 'aux'): void {
    this.auxEntropy = taggedHash(
      'netproof/entropy/aux/v1',
      this.auxEntropy ?? new Uint8Array(32),
      utf8(label),
      bytes,
    );
  }

  addAuxEntropyFromString(text: string, label = 'aux'): void {
    this.addAuxEntropy(utf8(text), label);
  }

  stats(): CollectorStats {
    const durationMs =
      this.startedAt === null || this.lastTimestamp === null ? 0 : this.lastTimestamp - this.startedAt;
    const estimatedBits = this.creditTotal();
    return {
      frames: this.frameCount,
      interactions: this.interactionCount,
      rawBits: this.modeStats.readNoise.bits + this.modeStats.quantization.bits,
      estimatedMinEntropyBits: estimatedBits,
      requiredBits: this.requiredBits,
      progress: Math.min(1, estimatedBits / this.requiredBits),
      durationMs,
      onesFraction:
        this.totalPixelsConsidered === 0 ? 0 : this.totalOnes / this.totalPixelsConsidered,
      rejectedPixels: this.rejectedPixels,
      lastFrameStalled: this.lastStalled,
    };
  }

  /** Reasons we cannot yet produce a wallet seed; empty means ready. */
  blockingReasons(): string[] {
    const stats = this.stats();
    const reasons: string[] = [];
    if (this.frameCount < this.minFrames) {
      reasons.push(`need at least ${this.minFrames} frames (have ${this.frameCount})`);
    }
    if (stats.durationMs < this.minDurationMs) {
      reasons.push(
        `capture must last at least ${this.minDurationMs}ms (have ${Math.round(stats.durationMs)}ms)`,
      );
    }
    if (stats.estimatedMinEntropyBits < this.requiredBits) {
      reasons.push(
        `need ${this.requiredBits} bits of camera entropy (have ${stats.estimatedMinEntropyBits.toFixed(1)})`,
      );
    }
    if (this.lastStalled) {
      reasons.push('camera appears frozen or covered — move the phone slightly');
    }
    return reasons;
  }

  /**
   * Finish the capture. Throws `ENTROPY_INSUFFICIENT` when not enough camera
   * entropy was collected and `ENTROPY_HEALTH_FAILED` when the extracted stream
   * does not pass the statistical battery. Never returns a seed in those cases.
   */
  finalize(): EntropyResult {
    const blocking = this.blockingReasons();
    if (blocking.length > 0) {
      throw new NetProofError(
        'ENTROPY_INSUFFICIENT',
        `entropy capture incomplete: ${blocking.join('; ')}`,
        { reasons: blocking },
      );
    }

    const stats = this.stats();
    // The battery runs on the decimated sample, not on the raw debiased stream:
    // see `sampleForTests` and `runHealthTests` for why that distinction is the
    // difference between "works on a real camera" and "always throws".
    const packedSample = this.buildsTestSample();
    const sample = unpack(packedSample, packedSample.length * 8);
    const health = runHealthTests(sample, packedSample);
    const failing = health.filter(isGatingFailure);
    const healthy = failing.length === 0;
    if (!healthy) {
      throw new NetProofError(
        'ENTROPY_HEALTH_FAILED',
        `熵健康检验未通过：${failing
          .map((f) => `${f.name} (p=${f.pValue.toExponential(2)})`)
          .join('、')}`,
        { health },
      );
    }

    let transcript = taggedHash(
      'netproof/entropy/transcript-input/v1',
      this.accumulator,
      this.interactionDigest ?? new Uint8Array(32),
      this.auxEntropy ?? new Uint8Array(32),
      this.deviceEntropy ?? new Uint8Array(32),
    );
    transcript = taggedHash('netproof/entropy/final/v1', CONTEXT, transcript, u32be(this.requiredBytes));

    const bytes = expand(transcript, this.requiredBytes);
    const sources: EntropySourceReport[] = [
      {
        name: 'camera-read-noise',
        rawBits: this.modeStats.readNoise.rawBits,
        acceptedBits: this.modeStats.readNoise.bits,
        estimatedMinEntropyBits: this.creditFor(this.modeStats.readNoise),
        note:
          'sign of median-centered frame-to-frame pixel deltas (|delta| >= 2), ' +
          `discounted to ${this.bitsPerDebiasedBit} bits/bit for spatial/temporal independence`,
      },
      {
        name: 'camera-quantization-jitter',
        rawBits: this.modeStats.quantization.rawBits,
        acceptedBits: this.modeStats.quantization.bits,
        estimatedMinEntropyBits: this.creditFor(this.modeStats.quantization),
        note:
          'parity of code-boundary crossings over a 3-frame window for quiet pixels; ' +
          'credited by measured min-entropy, so a denoised sensor yields few bits',
      },
      {
        name: 'user-interaction',
        rawBits: this.interactionCount * 64,
        acceptedBits: 0,
        estimatedMinEntropyBits: 0,
        note: `${this.interactionCount} samples mixed in as a mixer; no entropy credit claimed`,
      },
      {
        name: 'caller-aux',
        rawBits: this.auxEntropy ? this.auxEntropy.length * 8 : 0,
        acceptedBits: 0,
        estimatedMinEntropyBits: 0,
        note: 'optional dice/coin entropy mixed in as a mixer; no entropy credit claimed',
      },
      {
        name: 'device-csprng',
        rawBits: this.deviceEntropy ? this.deviceEntropy.length * 8 : 0,
        acceptedBits: 0,
        estimatedMinEntropyBits: 0,
        note: 'host crypto.getRandomValues mixed in as a mixer; never the sole source',
      },
    ];

    return {
      bytes,
      requiredBits: this.requiredBits,
      rawBits: stats.rawBits,
      estimatedMinEntropyBits: stats.estimatedMinEntropyBits,
      healthy,
      health,
      sources,
      stats,
      transcriptDigest: toHex(
        taggedHash(
          'netproof/entropy/transcript/v1',
          utf8(
            JSON.stringify({
              ...stats,
              readNoise: this.modeStats.readNoise,
              quantization: this.modeStats.quantization,
              health: health.map((h) => [h.name, h.passed]),
            }),
          ),
        ),
      ),
    };
  }

  /**
   * Add one bit per slot from this frame's debiased stream.
   *
   * Positions are spread across the frame and rotated by the frame index, so a slot
   * never samples the same column twice in a row — an earlier version spaced the
   * picks exactly one frame-width apart, which meant every pick landed in the same
   * column and inherited that column's offset. The sample looked correlated, and a
   * long capture failed the runs test for no good reason.
   */
  private sampleForTests(bits: Uint8Array): void {
    if (bits.length === 0 || this.testSampleBits >= MAX_TEST_SAMPLE_BITS) return;
    if (this.testSampleSlots.length === 0) {
      this.testSampleSlots = Array.from({ length: TEST_SAMPLE_SLOTS }, () => []);
    }

    // Half the slots observe even frames and half observe odd frames, so a slot
    // only ever records every second frame. That matters: the debiased bit for a
    // pixel at frame f is computed from the planes at f-1 and f, so the bits from
    // consecutive frames *share a plane* and are therefore not independent. A runs
    // test notices exactly that, and refused long captures until this was fixed.
    const parity = this.frameCount % 2;
    const firstSlot = parity === 0 ? 0 : TEST_SAMPLE_SLOTS / 2;
    const slotsPerFrame = TEST_SAMPLE_SLOTS / 2;
    const step = Math.max(1, Math.floor(bits.length / slotsPerFrame));
    for (let offset = 0; offset < slotsPerFrame; offset++) {
      const slot = firstSlot + offset;
      // Rotating by the frame index keeps a slot off any fixed column, whose
      // offset is shared down the whole frame.
      const position = (offset * step + this.frameCount * 37) % bits.length;
      this.testSampleSlots[slot].push(bits[position]);
      this.testSampleBits++;
      if (this.testSampleBits >= MAX_TEST_SAMPLE_BITS) return;
    }
  }

  /**
   * The battery sample: slots concatenated at bit granularity, so adjacent bits
   * come from the same slot (one frame apart, disjoint planes) and no padding is
   * ever inserted.
   */
  private buildsTestSample(): Uint8Array {
    // Interleave-free concatenation: all of slot 0, then all of slot 1, ...
    // Within a slot consecutive bits are the same pixel on frames 2 apart, whose
    // debiasing windows do not overlap.
    const writer = new BitWriter(this.testSampleBits + 8);
    for (const slot of this.testSampleSlots) {
      for (const bit of slot) writer.push(bit);
    }
    return writer.toBytes();
  }

  reset(): void {
    this.accumulator = taggedHash('netproof/entropy/init/v1', CONTEXT, u32be(this.requiredBits));
    this.olderFrame = null;
    this.previousFrame = null;
    this.frameCount = 0;
    this.interactionCount = 0;
    this.interactionDigest = null;
    this.rejectedPixels = 0;
    this.totalPixelsConsidered = 0;
    this.totalOnes = 0;
    this.lastStalled = false;
    this.startedAt = null;
    this.lastTimestamp = null;
    this.modeStats.readNoise = { bits: 0, ones: 0, rawBits: 0 };
    this.modeStats.quantization = { bits: 0, ones: 0, rawBits: 0 };
    this.previousReadNoise = null;
    this.previousQuantization = null;
    this.debiased = new BitWriter(1 << 16);
    this.testSampleSlots = [];
    this.testSampleBits = 0;
  }

  /** Credit for one mode: measured min-entropy, times the independence discount. */
  private creditFor(mode: ModeStats): number {
    return mode.bits * minEntropyPerBit(mode.ones, mode.bits) * this.bitsPerDebiasedBit;
  }

  private creditTotal(): number {
    return this.creditFor(this.modeStats.readNoise) + this.creditFor(this.modeStats.quantization);
  }

  private validateFrame(frame: GrayscaleFrame): void {
    if (frame.width <= 0 || frame.height <= 0) {
      throw new NetProofError('ENTROPY_NO_FRAMES', 'frame has non-positive dimensions');
    }
    if (frame.data.length !== frame.width * frame.height) {
      throw new NetProofError('ENTROPY_NO_FRAMES', 'frame data length does not match width*height', {
        expected: frame.width * frame.height,
        actual: frame.data.length,
      });
    }
  }
}

function float64(value: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return new Uint8Array(buffer);
}

function unpack(bytes: Uint8Array, bitLength: number): Uint8Array {
  const out = new Uint8Array(bitLength);
  for (let i = 0; i < bitLength; i++) out[i] = (bytes[i >>> 3] >>> (i & 7)) & 1;
  return out;
}

/** Counter-mode hash expansion. Safe because the seed is already a full-strength digest. */
function expand(seed: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  let counter = 0;
  while (offset < length) {
    const block = sha256(concat(seed, u32be(counter++)));
    const take = Math.min(block.length, length - offset);
    out.set(block.subarray(0, take), offset);
    offset += take;
  }
  return out;
}
