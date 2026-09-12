/**
 * What the camera is actually delivering, from the pixels it delivers.
 *
 * Written for one report: 「扫不到二维码，一直没反应」. A scanner that says nothing while it
 * fails is indistinguishable from a scanner that is broken, a lens that is covered, a preview
 * that froze and a code that is simply unreadable — and the user cannot act on any of those
 * until they know which one it is. These three cheap measurements over the frame we are about
 * to decode anyway separate them:
 *
 *   - mean brightness, which is near zero through a covered lens and near white against a
 *     blown-out screen, and in both cases there is no contrast to find a code in;
 *   - a signature of the pixels, which stops changing when a preview freezes — on a real
 *     camera, sensor noise means two frames are never byte-identical;
 *   - how many samples have looked like that in a row, so one dark frame during a hand
 *     movement is not reported as a covered lens.
 *
 * Everything here is deliberately a pure function of pixels: the failure it exists to explain
 * happens on a physical phone, and this at least pins the arithmetic.
 */

export interface FrameQuality {
  /** 0-255, sampled sparsely. */
  luma: number;
  /** Cheap hash of the sampled pixels, for detecting a stream that stopped moving. */
  signature: number;
  /** Spread of the sampled pixels: a blank frame has almost none. */
  spread: number;
}

/**
 * How many pixels to look at. Enough to characterise a frame, cheap enough for every frame.
 */
const SAMPLES = 512;

/**
 * The pixels to look at, scattered rather than strided.
 *
 * A fixed stride is the obvious way to do this and the wrong one: a QR code is periodic, and a
 * stride that happens to line up with the module pitch samples the same phase of every module —
 * which is how a test frame with a visible pattern read as flat, and would have been reported
 * to the user as a frozen camera. A multiplicative hash over the pixel count scatters the
 * samples instead, deterministically, so the same frame always measures the same and no
 * periodic image can hide from it.
 */
function sampleIndices(pixels: number): number[] {
  const count = Math.min(SAMPLES, pixels);
  const out: number[] = [];
  for (let n = 0; n < count; n++) out.push((n * 2654435761) % pixels);
  return out;
}

export function frameQuality(data: Uint8ClampedArray | Uint8Array): FrameQuality {
  const pixels = Math.floor(data.length / 4);
  if (pixels === 0) return { luma: 0, signature: 0, spread: 0 };

  let sum = 0;
  let signature = 0;
  let min = 255;
  let max = 0;
  let count = 0;
  for (const pixel of sampleIndices(pixels)) {
    const index = pixel * 4;
    const luma = (data[index]! * 299 + data[index + 1]! * 587 + data[index + 2]! * 114) / 1000;
    sum += luma;
    count += 1;
    if (luma < min) min = luma;
    if (luma > max) max = luma;
    // A cheap rolling hash of the sampled luma, compared only against itself over time.
    signature = (signature * 31 + Math.round(luma)) | 0;
  }
  return { luma: sum / count, signature, spread: max - min };
}

/**
 * RGBA to one byte per pixel.
 *
 * The finder-pattern search wants a grey image and does not care about colour; a QR code on a
 * screen is black and white anyway. One pass, once every few hundred milliseconds.
 */
export function grayscale(data: Uint8ClampedArray | Uint8Array, pixels: number): Uint8Array {
  const out = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index++) {
    const at = index * 4;
    out[index] = (data[at]! * 299 + data[at + 1]! * 587 + data[at + 2]! * 114) / 1000;
  }
  return out;
}

/**
 * How sharp the picture is, as the average jump between neighbouring pixels.
 *
 * This is the measurement that was missing. A code can be the right size, brightly lit, in the
 * middle of the frame — and unreadable, because the lens never focused on it. Blur leaves a
 * finder pattern as a vague grey block, the binarizer finds no edges, and every other number the
 * app had says "fine". A sharp photograph of a QR code measures roughly 30-60 here; a smeared one
 * sits under 15, and around 5 the picture is a watercolour.
 *
 * Every other pixel in each direction: enough to characterise focus, cheap enough per frame.
 */
export interface SharpRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function sharpness(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  region?: SharpRegion,
): number {
  const left = Math.max(0, Math.floor(region?.left ?? 0));
  const top = Math.max(0, Math.floor(region?.top ?? 0));
  const right = Math.min(width, Math.ceil(region?.right ?? width));
  const bottom = Math.min(height, Math.ceil(region?.bottom ?? height));
  let sum = 0;
  let count = 0;
  for (let y = top; y + 2 < bottom; y += 2) {
    for (let x = left; x + 2 < right; x += 2) {
      const here = gray[y * width + x]!;
      sum += Math.abs(here - gray[y * width + x + 2]!) + Math.abs(here - gray[(y + 2) * width + x]!);
      count += 2;
    }
  }
  return count === 0 ? 0 : sum / count;
}

/** Below this the picture is too soft for a code to survive, whatever its module size. */
export const SHARP_ENOUGH = 14;

export type FrameVerdict = 'ok' | 'blank' | 'dark' | 'frozen';

/** Below this mean brightness there is nothing to threshold. */
const DARK_LUMA = 12;
/** Above it, the picture is blown out — a screen at full brightness and close range. */
const BLANK_LUMA = 246;
/** Below this spread, a frame is a single flat colour. */
const FLAT_SPREAD = 24;
/** How many identical frames in a row mean "this preview is not updating". */
const FROZEN_SAMPLES = 12;
/** How many samples in a row must be dark or flat before we say so. */
const BAD_SAMPLES = 8;

/**
 * Classify the recent history.
 *
 * Order matters, and it is the order of likelihood and of usefulness:
 *
 *   1. `dark` and `blank` first. A covered lens and a screen photographed too closely are what
 *      actually happens to people, and both are things they can fix in a second. A black frame
 *      is also perfectly still, so a frozen-check that ran first would diagnose a stuck camera
 *      when the answer is 「镜头被挡住了」.
 *   2. `frozen` last, and only for a picture that *looks* like something: a frame with real
 *      contrast whose signature has not changed in a dozen samples. That is a preview that
 *      stopped updating, which no amount of moving the phone will fix.
 */
export function classifyQuality(history: FrameQuality[]): FrameVerdict {
  if (history.length === 0) return 'ok';

  const recent = history.slice(-Math.max(FROZEN_SAMPLES, BAD_SAMPLES));

  if (recent.length >= BAD_SAMPLES) {
    const tail = recent.slice(-BAD_SAMPLES);
    if (tail.every((entry) => entry.luma < DARK_LUMA)) return 'dark';
    if (tail.every((entry) => entry.luma > BLANK_LUMA || entry.spread < FLAT_SPREAD)) return 'blank';
  }

  if (recent.length >= FROZEN_SAMPLES) {
    const tail = recent.slice(-FROZEN_SAMPLES);
    const first = tail[0]!;
    const textured = tail.every((entry) => entry.spread >= FLAT_SPREAD);
    if (textured && tail.every((entry) => entry.signature === first.signature)) return 'frozen';
  }

  return 'ok';
}
