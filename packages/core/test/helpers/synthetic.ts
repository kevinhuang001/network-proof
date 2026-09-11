import { sha256 } from '@noble/hashes/sha2.js';
import { concat, u32be } from '../../src/util/bytes';
import type { GrayscaleFrame, InteractionSample } from '../../src/entropy/types';

/**
 * Deterministic CSPRNG for tests: SHA-256 in counter mode. Using a hash (rather
 * than Math.random) means a failing test is always reproducible from its seed.
 */
export class TestDrbg {
  private counter = 0;
  private readonly seed: Uint8Array;
  private pool: Uint8Array = new Uint8Array(0);
  private offset = 0;

  constructor(seed: string | Uint8Array) {
    this.seed = typeof seed === 'string' ? new TextEncoder().encode(seed) : seed;
  }

  private refill(): void {
    this.pool = sha256(concat(this.seed, u32be(this.counter++)));
    this.offset = 0;
  }

  bytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      if (this.offset >= this.pool.length) this.refill();
      out[i] = this.pool[this.offset++];
    }
    return out;
  }

  /** Uniform float in [0,1) with 32 bits of precision. */
  float(): number {
    const b = this.bytes(4);
    // `>>> 0` is essential: without it the shift produces a signed 32-bit value
    // and roughly half of all samples come out negative.
    return (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0) / 0x1_0000_0000;
  }

  /** Box–Muller normal sample. */
  normal(mean = 0, sigma = 1): number {
    let u = this.float();
    if (u === 0) u = Number.EPSILON;
    const v = this.float();
    return mean + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  int(maxExclusive: number): number {
    return Math.floor(this.float() * maxExclusive) % maxExclusive;
  }
}

export interface SyntheticCaptureOptions {
  frameCount: number;
  width?: number;
  height?: number;
  /** Standard deviation of the per-pixel sensor noise, in gray levels. */
  sigma?: number;
  seed?: string;
  /** Constant base illumination, shared by every frame. */
  background?: number;
  /** Milliseconds between frames. */
  frameIntervalMs?: number;
  /** Fraction of pixels that change deterministically (a "moving scene"). */
  motionFraction?: number;
  /** When true, every frame is byte-identical (covered lens / frozen preview). */
  frozen?: boolean;
  /** Adds a slow global illumination drift, to exercise the median centering. */
  drift?: number;
}

/**
 * Build a synthetic camera capture: a static scene plus independent Gaussian
 * sensor noise per pixel per frame. This models the physical process the real
 * extractor relies on (read noise + shot noise + ADC jitter), and lets tests
 * assert both the happy path and the "this is not noise" failure paths.
 */
export function syntheticFrames(options: SyntheticCaptureOptions): GrayscaleFrame[] {
  const {
    frameCount,
    width = 64,
    height = 48,
    sigma = 3,
    seed = 'netproof-test',
    background = 128,
    frameIntervalMs = 33,
    motionFraction = 0,
    frozen = false,
    drift = 0,
  } = options;

  const drbg = new TestDrbg(seed);
  const frames: GrayscaleFrame[] = [];
  // A deterministic background pattern (fixed-pattern noise / scene texture).
  const pattern = new Uint8Array(width * height);
  for (let i = 0; i < pattern.length; i++) pattern[i] = drbg.int(64);

  let firstData: Uint8Array | null = null;
  for (let f = 0; f < frameCount; f++) {
    if (frozen && firstData) {
      frames.push({ data: firstData.slice(), width, height, timestamp: f * frameIntervalMs });
      continue;
    }
    const data = new Uint8Array(width * height);
    const globalDrift = Math.round(drift * f);
    for (let i = 0; i < data.length; i++) {
      let value = background + (pattern[i] % 16) - 8 + globalDrift + drbg.normal(0, sigma);
      if (motionFraction > 0 && i < pattern.length * motionFraction) {
        // Deterministic, high-contrast change: must be rejected by the extractor.
        value += f % 2 === 0 ? 90 : -90;
      }
      data[i] = Math.max(0, Math.min(255, Math.round(value)));
    }
    if (f === 0) firstData = data.slice();
    frames.push({ data, width, height, timestamp: f * frameIntervalMs });
  }
  return frames;
}

/** Frames whose per-pixel deltas are constant (a stuck sensor or a flat image). */
export function degenerateFrames(frameCount: number, size = 256): GrayscaleFrame[] {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = 100 + (i % 3);
  return Array.from({ length: frameCount }, (_, f) => ({
    data: data.slice(),
    width: size,
    height: 1,
    timestamp: f * 33,
  }));
}

export function interactionSamples(count: number, seed = 'taps'): InteractionSample[] {
  const drbg = new TestDrbg(seed);
  return Array.from({ length: count }, (_, i) => ({
    timestamp: i * 16.7 + drbg.float(),
    x: drbg.float() * 1000,
    y: drbg.float() * 2000,
    force: drbg.float(),
  }));
}

/**
 * A deliberately *realistic* sensor model.
 *
 * `syntheticFrames` above gives each pixel independent noise, which no real camera
 * does. This generator adds the artefacts that matter for the extractor:
 *
 *  - **row offset** redrawn per frame (readout banding), shared down a whole row;
 *  - **column offset** redrawn per frame, shared down a whole column;
 *  - **PRNU** (fixed-pattern noise), constant per pixel for the whole capture.
 *
 * These make neighbouring pixels correlated. That is not a defect to be modelled
 * away — it is the reason the extractor pairs bits across *time* for one pixel
 * instead of across *space*, and it is what makes the statistical battery
 * meaningful only on a sample assembled to be approximately i.i.d.
 */
export function correlatedFrames(options: {
  frameCount: number;
  width?: number;
  height?: number;
  /** Per-pixel read noise, in gray levels. */
  sigma?: number;
  /** Row-offset magnitude; raise it to simulate heavy banding. */
  banding?: number;
  /** Column-offset magnitude. */
  columnNoise?: number;
  background?: number;
  seed?: string;
  frameIntervalMs?: number;
}): GrayscaleFrame[] {
  const {
    frameCount,
    width = 256,
    height = 256,
    sigma = 3,
    banding = 1.5,
    columnNoise = 0.8,
    background = 128,
    seed = 'correlated',
    frameIntervalMs = 33,
  } = options;
  const drbg = new TestDrbg(seed);
  const prnu = new Uint8Array(width * height);
  for (let i = 0; i < prnu.length; i++) prnu[i] = drbg.int(24);

  const frames: GrayscaleFrame[] = [];
  for (let f = 0; f < frameCount; f++) {
    const data = new Uint8Array(width * height);
    const rowOffset = new Float32Array(height);
    for (let y = 0; y < height; y++) rowOffset[y] = drbg.normal(0, banding);
    const columnOffset = new Float32Array(width);
    for (let x = 0; x < width; x++) columnOffset[x] = drbg.normal(0, columnNoise);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const value =
          background + (prnu[i] - 12) + rowOffset[y] + columnOffset[x] + drbg.normal(0, sigma);
        data[i] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }
    frames.push({ data, width, height, timestamp: f * frameIntervalMs });
  }
  return frames;
}

/**
 * A dark, quantization-limited sensor where each pixel independently picks one of
 * two adjacent codes per frame.
 *
 * Worth being precise about, because it is easy to mistake for a bad source: the
 * fluctuation is *genuinely random* (independent per pixel per frame), so there is
 * real entropy here and the extractor is right to find it. What matters is that the
 * claim stays conservative — the measured ones-fraction is far from 0.5, so the
 * min-entropy discount shrinks the credit accordingly.
 */
export function twoCodeJitterFrames(frameCount: number, size = 64, seed = 'dark'): GrayscaleFrame[] {
  const drbg = new TestDrbg(seed);
  return Array.from({ length: frameCount }, (_, f) => {
    const data = new Uint8Array(size * size);
    for (let i = 0; i < data.length; i++) data[i] = drbg.int(256) < 250 ? 100 : 101;
    return { data, width: size, height: size, timestamp: f * 33 };
  });
}

/**
 * A source with structure but no randomness: every pixel alternates between two
 * codes on a fixed period, exactly the same way in every frame. There is plenty of
 * *variation* here and none of it is unpredictable, so the extractor must refuse.
 */
export function deterministicPatternFrames(frameCount: number, size = 64): GrayscaleFrame[] {
  return Array.from({ length: frameCount }, (_, f) => {
    const data = new Uint8Array(size * size);
    for (let i = 0; i < data.length; i++) {
      // Spatially varied but temporally periodic: `(i + f) % 2` repeats exactly.
      data[i] = (i + f) % 2 === 0 ? 100 : 102;
    }
    return { data, width: size, height: size, timestamp: f * 33 };
  });
}
