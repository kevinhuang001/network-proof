import { NetProofError } from '../errors';
import type { GrayscaleFrame } from './types';

export interface NoiseExtractionOptions {
  /**
   * Absolute temporal-difference magnitude above which a pixel is considered to
   * be showing *scene* change (motion, auto-exposure step, hot pixel) rather than
   * sensor noise. Such pixels are dropped instead of contributing a bit.
   */
  maxFrameDelta?: number;
  /**
   * Smallest |delta| that we trust as "the read noise moved this pixel by a whole
   * ADC code". Deltas of ±1 are ambiguous between noise and quantization, so they
   * are routed to the quantization-jitter extractor instead.
   */
  readNoiseThreshold?: number;
}

export interface NoiseExtraction {
  /**
   * Per-pixel sign plane, indexed by pixel (dense: one entry per pixel of the
   * frame). Only meaningful where `contributing[i] === 1`.
   *
   * The plane is dense and pixel-indexed on purpose. An earlier version returned a
   * *compacted* list of bits, which forced the debiasing stage to pair adjacent
   * entries — that is, neighbouring pixels. Neighbouring pixels are spatially
   * correlated (row noise, PRNU, optical blur), so von Neumann's i.i.d. assumption
   * was violated and it discarded 99.6% of the entropy on a realistic sensor
   * model. Pairing the same pixel across *time* is where the assumption holds.
   */
  plane: Uint8Array;
  /** 1 where this pixel produced a usable bit, 0 where it was rejected. */
  contributing: Uint8Array;
  pixelsConsidered: number;
  pixelsRejected: number;
  /** Fraction of 1 bits among contributing pixels; ~0.5 is what we want to see. */
  onesFraction: number;
  /** Mean of the (centered) temporal differences actually used. */
  meanCenteredDelta: number;
}

/**
 * Mode B — read-noise extraction from a pair of frames.
 *
 * A static scene plus a fixed sensor produces identical pixels frame after frame,
 * so the difference is dominated by read noise, shot noise and ADC jitter:
 * physical processes an attacker cannot predict or replay. We remove residual
 * global bias (auto-exposure drift) by subtracting the median delta, and we drop
 * pixels whose delta is too large to be noise.
 *
 * This mode only yields bits when the sensor's noise exceeds roughly one ADC
 * code. `extractQuantizationJitter` covers the opposite regime.
 */
export function extractTemporalNoise(
  previous: GrayscaleFrame,
  current: GrayscaleFrame,
  options: NoiseExtractionOptions = {},
): NoiseExtraction {
  const maxFrameDelta = options.maxFrameDelta ?? 48;
  const threshold = options.readNoiseThreshold ?? 2;
  if (previous.data.length !== current.data.length) {
    throw new NetProofError('ENTROPY_NO_FRAMES', 'frames have different sizes', {
      previous: previous.data.length,
      current: current.data.length,
    });
  }
  const length = current.data.length;
  if (length === 0) throw new NetProofError('ENTROPY_NO_FRAMES', 'empty frame');

  // Pass 1: signed pixel differences. A 257-bucket histogram gives the median
  // without allocating an array of `length` numbers.
  const diffs = new Int16Array(length);
  const histogram = new Uint32Array(257);
  for (let i = 0; i < length; i++) {
    const delta = current.data[i] - previous.data[i];
    diffs[i] = delta;
    histogram[delta + 128]++;
  }
  const median = histogramMedian(histogram, length);

  // Pass 2: record the sign of each centered difference, per pixel index.
  const plane = new Uint8Array(length);
  const contributing = new Uint8Array(length);
  let emitted = 0;
  let ones = 0;
  let rejected = 0;
  let sumCentered = 0;
  for (let i = 0; i < length; i++) {
    const raw = diffs[i];
    const magnitude = raw < 0 ? -raw : raw;
    if (magnitude > maxFrameDelta || magnitude < threshold) {
      // Above the threshold it is scene motion, not noise; below it the pixel is
      // quantization-limited and a single frame pair carries no usable bit.
      rejected++;
      continue;
    }
    const centered = raw - median;
    if (centered === 0) {
      // Exactly the median: no information either way.
      rejected++;
      continue;
    }
    sumCentered += centered;
    plane[i] = centered > 0 ? 1 : 0;
    contributing[i] = 1;
    emitted++;
    if (centered > 0) ones++;
  }

  return {
    plane,
    contributing,
    pixelsConsidered: emitted,
    pixelsRejected: rejected,
    onesFraction: emitted === 0 ? 0 : ones / emitted,
    meanCenteredDelta: emitted === 0 ? 0 : sumCentered / emitted,
  };
}

/**
 * Mode A — quantization-jitter extraction over three consecutive frames.
 *
 * When the sensor's noise is *smaller* than one ADC step (well-lit scene, low
 * gain, or a preview pipeline that denoises), the pixel value sits pinned to a
 * single code and Mode B extracts nothing at all. The randomness is still there:
 * a pixel whose true illumination falls near a code boundary flips between two
 * adjacent codes from frame to frame.
 *
 * We therefore take, for pixels that were *quiet* across the whole window
 * (|delta| <= 1 on both steps, so no scene motion explains the change), the
 * parity of how many code boundaries were crossed:
 *
 *     bit = (value[t] ^ value[t-2]) & 1
 *
 * Pixels far from a boundary always yield 0; von Neumann debiasing discards those
 * pairs, and the collector's per-mode min-entropy accounting refuses to claim
 * credit for a stream that is mostly zeros. So a clean sensor produces *fewer*
 * claimed bits rather than a silently weak wallet.
 */
export function extractQuantizationJitter(
  older: GrayscaleFrame,
  previous: GrayscaleFrame,
  current: GrayscaleFrame,
): NoiseExtraction {
  if (older.data.length !== current.data.length || previous.data.length !== current.data.length) {
    throw new NetProofError('ENTROPY_NO_FRAMES', 'frames have different sizes');
  }
  const length = current.data.length;
  if (length === 0) throw new NetProofError('ENTROPY_NO_FRAMES', 'empty frame');

  const plane = new Uint8Array(length);
  const contributing = new Uint8Array(length);
  let emitted = 0;
  let ones = 0;
  let rejected = 0;
  let sumParity = 0;
  for (let i = 0; i < length; i++) {
    const a = older.data[i];
    const b = previous.data[i];
    const c = current.data[i];
    const delta1 = b - a;
    const delta2 = c - b;
    if (delta1 > 1 || delta1 < -1 || delta2 > 1 || delta2 < -1) {
      // The pixel actually moved: this is scene signal, not quantization noise.
      rejected++;
      continue;
    }
    const bit = (c ^ a) & 1;
    plane[i] = bit;
    contributing[i] = 1;
    emitted++;
    ones += bit;
    sumParity += bit;
  }

  return {
    plane,
    contributing,
    pixelsConsidered: emitted,
    pixelsRejected: rejected,
    onesFraction: emitted === 0 ? 0 : ones / emitted,
    meanCenteredDelta: emitted === 0 ? 0 : sumParity / emitted,
  };
}

function histogramMedian(histogram: Uint32Array, total: number): number {
  const target = total >> 1;
  let cumulative = 0;
  for (let i = 0; i < histogram.length; i++) {
    cumulative += histogram[i];
    if (cumulative > target) return i - 128;
  }
  return 0;
}

/** Convert RGBA/BGRA or RGB pixel data to the grayscale frames used above. */
export function toGrayscale(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  channels = 4,
): GrayscaleFrame {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += channels) {
    // Rec. 601 luma, integer arithmetic (weights sum to 256).
    data[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return { data, width, height, timestamp: 0 };
}

/**
 * Von Neumann debiasing applied **per pixel across time**.
 *
 * `previous` is the same pixel's bit one frame earlier. A pair is kept only when
 * the two frames disagree, which yields an unbiased bit regardless of the source's
 * bias — provided the two bits of a pair are independent, which is the case for one
 * pixel over time but emphatically *not* for two neighbouring pixels.
 *
 * A pixel that produced no usable bit in either frame contributes nothing.
 */
export function debiasTemporally(
  previousPlane: Uint8Array,
  previousContributing: Uint8Array,
  currentPlane: Uint8Array,
  currentContributing: Uint8Array,
): { bits: Uint8Array; discarded: number } {
  const length = Math.min(
    previousPlane.length,
    currentPlane.length,
    previousContributing.length,
    currentContributing.length,
  );
  const out = new Uint8Array(length);
  let emitted = 0;
  let discarded = 0;
  for (let i = 0; i < length; i++) {
    if (previousContributing[i] === 0 || currentContributing[i] === 0) {
      discarded++;
      continue;
    }
    const a = previousPlane[i];
    const b = currentPlane[i];
    if (a === b) {
      discarded++;
      continue;
    }
    out[emitted++] = a === 0 ? 0 : 1;
  }
  return { bits: out.slice(0, emitted), discarded };
}

/** Per-bit min-entropy estimate from an observed ones-fraction (MCV, per bit). */
export function minEntropyPerBit(ones: number, total: number): number {
  if (total <= 0) return 0;
  const p1 = ones / total;
  const phat = Math.max(p1, 1 - p1);
  if (phat >= 1) return 0;
  return -Math.log2(phat);
}
