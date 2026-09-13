import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { qr as qrTokens } from '@netproof/ui';
import { estimateFinder } from './finderPattern';

/**
 * Read a QR code out of a photograph.
 *
 * This replaces the live camera on the device, and it replaces it because the live camera was the
 * thing that would not work: a WebView's video frames arrive at whatever resolution, orientation
 * and focus the platform felt like, and the preview the user judges them by is not necessarily
 * the same picture. The phone's own camera app, asked for a still photograph, produces a
 * full-resolution, autofocused, auto-exposed image — the thing every phone is actually good at —
 * and a still image of a still code has no timing problem at all.
 *
 * Two passes, because a 12-megapixel photograph cannot be handed to a JavaScript decoder whole:
 *
 *   1. the whole picture, reduced to something a browser can scan quickly, which finds a code
 *      that fills a reasonable part of the frame;
 *   2. if that finds nothing, the finder patterns are located in that same reduced copy, mapped
 *      back to the original pixels, and that region alone is decoded at full resolution. Cropping
 *      is safe here in a way it never was on a live stream: the coordinates come from a still
 *      image that is not moving, and the crop is where a code was actually measured to be.
 */

/** The longest side of the reduced copy used for the first pass. */
const OVERVIEW_MAX = 1400;

/** The longest side of a region decoded at full resolution. */
const REGION_MAX = 1600;

/** How much of the code's own width to add around a located region, as a fraction. */
const REGION_MARGIN = 0.18;

export interface PhotoAttempt {
  name: string;
  width: number;
  height: number;
  decoded: boolean;
}

export interface PhotoScanResult {
  /** The frame text, or null when no code could be read. */
  text: string | null;
  /** The photograph's own size. */
  size: { width: number; height: number };
  /** What was tried, for the diagnostics screen and for the sentence the user is shown. */
  attempts: PhotoAttempt[];
  /** A picture of the pass that worked, or of the last one, for the screen. */
  preview: string | null;
}

/**
 * Where to crop, in the original image, given a region found in a scaled copy.
 *
 * Pure, and separated for that reason: the arithmetic here is the one thing in this file a test
 * can hold still, and getting it wrong means confidently decoding the wrong part of a photograph.
 */
export function cropForRegion(
  region: { left: number; top: number; right: number; bottom: number },
  scale: number,
  image: { width: number; height: number },
): { left: number; top: number; right: number; bottom: number } {
  const width = region.right - region.left;
  const height = region.bottom - region.top;
  const margin = Math.max(width, height) * REGION_MARGIN;
  const toSource = (value: number): number => value / scale;
  return {
    left: Math.max(0, Math.floor(toSource(region.left - margin))),
    top: Math.max(0, Math.floor(toSource(region.top - margin))),
    right: Math.min(image.width, Math.ceil(toSource(region.right + margin))),
    bottom: Math.min(image.height, Math.ceil(toSource(region.bottom + margin))),
  };
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建 2D 画布上下文');
  return { canvas, context };
}

function grayscale(data: Uint8ClampedArray, pixels: number): Uint8Array {
  const out = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index++) {
    const at = index * 4;
    out[index] = (data[at]! * 299 + data[at + 1]! * 587 + data[at + 2]! * 114) / 1000;
  }
  return out;
}

function previewOf(canvas: HTMLCanvasElement, max = 420): string | null {
  try {
    const fit = Math.min(1, max / Math.max(canvas.width, canvas.height, 1));
    const { canvas: small, context } = canvasOf(
      Math.max(1, Math.round(canvas.width * fit)),
      Math.max(1, Math.round(canvas.height * fit)),
    );
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/**
 * Get the photograph into something drawable.
 *
 * `createImageBitmap` is the quick way and the one that fails first: an old WebView cannot always
 * decode a large JPEG, and some Android cameras hand back HEIC, which it cannot decode at all. An
 * `<img>` element goes through the platform's own image pipeline instead — the same one that shows
 * photographs in the gallery — so it is the fallback, and between them there is very little that
 * cannot be opened.
 */
async function loadImage(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; how: string }> {
  try {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, how: 'createImageBitmap' };
  } catch (bitmapError) {
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('图片解码失败'));
        element.src = url;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, how: 'img' };
    } catch (imageError) {
      throw new Error(
        `${(bitmapError as Error).message}；换用 img 也不行：${(imageError as Error).message}`,
      );
    } finally {
      // The element has decoded by now; revoking is safe and the object URL is memory.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }
}

/** Decode a photograph. Never throws for "no code here" — that is a result, not an error. */
export async function scanPhoto(blob: Blob): Promise<PhotoScanResult> {
  const attempts: PhotoAttempt[] = [];
  const loaded = await loadImage(blob);
  const bitmap = loaded.source;
  const size = { width: loaded.width, height: loaded.height };
  attempts.push({
    name: `打开照片（${loaded.how}）`,
    width: loaded.width,
    height: loaded.height,
    decoded: true,
  });

  try {
    // Pass 1: the whole photograph, reduced.
    const scale = Math.min(1, OVERVIEW_MAX / Math.max(size.width, size.height));
    const overview = canvasOf(
      Math.max(1, Math.round(size.width * scale)),
      Math.max(1, Math.round(size.height * scale)),
    );
    overview.context.imageSmoothingEnabled = scale < 1;
    overview.context.imageSmoothingQuality = 'high';
    overview.context.drawImage(bitmap, 0, 0, overview.canvas.width, overview.canvas.height);
    const overviewImage = overview.context.getImageData(0, 0, overview.canvas.width, overview.canvas.height);
    const first = jsQR(overviewImage.data, overviewImage.width, overviewImage.height, {
      inversionAttempts: 'attemptBoth',
    });
    attempts.push({
      name: '整张（缩小）',
      width: overviewImage.width,
      height: overviewImage.height,
      decoded: first !== null,
    });
    if (first?.data) {
      return { text: first.data, size, attempts, preview: previewOf(overview.canvas) };
    }

    // Pass 2: locate the code in that copy, then read its region from the original pixels.
    const estimate = estimateFinder(
      grayscale(overviewImage.data, overviewImage.width * overviewImage.height),
      overviewImage.width,
      overviewImage.height,
    );
    if (estimate?.region) {
      const crop = cropForRegion(estimate.region, scale, size);
      const width = crop.right - crop.left;
      const height = crop.bottom - crop.top;
      const fit = Math.min(1, REGION_MAX / Math.max(width, height, 1));
      const region = canvasOf(
        Math.max(1, Math.round(width * fit)),
        Math.max(1, Math.round(height * fit)),
      );
      region.context.imageSmoothingEnabled = fit < 1;
      region.context.imageSmoothingQuality = 'high';
      region.context.drawImage(
        bitmap,
        crop.left,
        crop.top,
        width,
        height,
        0,
        0,
        region.canvas.width,
        region.canvas.height,
      );
      const regionImage = region.context.getImageData(0, 0, region.canvas.width, region.canvas.height);
      const second = jsQR(regionImage.data, regionImage.width, regionImage.height, {
        inversionAttempts: 'attemptBoth',
      });
      attempts.push({
        name: '二维码区域（原始像素）',
        width: regionImage.width,
        height: regionImage.height,
        decoded: second !== null,
      });
      if (second?.data) {
        return { text: second.data, size, attempts, preview: previewOf(region.canvas) };
      }
      return { text: null, size, attempts, preview: previewOf(overview.canvas) };
    }

    attempts.push({ name: '定位二维码', width: 0, height: 0, decoded: false });
    return { text: null, size, attempts, preview: previewOf(overview.canvas) };
  } finally {
    // A 12-megapixel bitmap is tens of megabytes; a phone that keeps several is a phone that
    // reloads the page.
    (bitmap as ImageBitmap).close?.();
  }
}

/**
 * Is the decoder itself working, on this phone, in this WebView?
 *
 * Written to answer a question I could not answer from here: 「是不是你的二维码识别有问题啊」. The
 * camera, the photograph, the file picker and the WebView are all suspects, and every one of them
 * is outside my reach — but the decode path is not. So the device builds a QR code itself, turns it
 * into a JPEG the way a photograph would arrive, and reads it back through exactly the code that
 * reads photographs.
 *
 * If this fails, the fault is mine and the screen says so. If it passes, the decoder is fine and
 * the photograph is the thing to look at — which is a different conversation, and a much shorter
 * one.
 */
export interface SelfTestResult {
  ok: boolean;
  /** Every step, for the screen, so a failure says where it failed rather than just "failed". */
  steps: { name: string; ok: boolean; detail: string }[];
}

export async function decoderSelfTest(): Promise<SelfTestResult> {
  const steps: SelfTestResult['steps'] = [];
  const payload = `NP1:NP-REQ:0-1:${'AB7C9D2E5F8G4H6J0K1LM3N4P5Q6R7S8T'.repeat(10)}`;

  let blob: Blob | null = null;
  try {
    const created = QRCode.create(payload, { errorCorrectionLevel: qrTokens.errorCorrectionLevel });
    const size = created.modules.size;
    const quiet = qrTokens.quietZoneModules;
    const modulePx = 10;
    const side = (size + quiet * 2) * modulePx;
    const { canvas, context } = canvasOf(side, side);
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, side, side);
    context.fillStyle = '#0B0B0F';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!created.modules.data[y * size + x]) continue;
        context.fillRect((quiet + x) * modulePx, (quiet + y) * modulePx, modulePx, modulePx);
      }
    }
    steps.push({ name: '生成二维码', ok: true, detail: `${size} 模块，${side}×${side} 像素` });

    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
    steps.push({
      name: '转成 JPEG（模拟照片）',
      ok: blob !== null,
      detail: blob ? `${Math.round(blob.size / 1024)} KB` : 'toBlob 返回空',
    });
    if (!blob) return { ok: false, steps };
  } catch (error) {
    steps.push({ name: '生成二维码', ok: false, detail: (error as Error).message });
    return { ok: false, steps };
  }

  try {
    const result = await scanPhoto(blob);
    const matched = result.text === payload;
    steps.push({
      name: '读回这张 JPEG',
      ok: matched,
      detail: matched
        ? `成功，${result.attempts.map((attempt) => attempt.name).join(' → ')}`
        : result.text === null
          ? `没有读出内容（${result.attempts.map((attempt) => `${attempt.name}:${attempt.width}×${attempt.height} ${attempt.decoded ? '✓' : '✗'}`).join('，')}）`
          : '读出的内容与写入的不一致',
    });
    return { ok: matched, steps };
  } catch (error) {
    steps.push({ name: '读回这张 JPEG', ok: false, detail: `抛错：${(error as Error).message}` });
    return { ok: false, steps };
  }
}
