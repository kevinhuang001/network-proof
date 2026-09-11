import jsQR from 'jsqr';
import { FrameCollector } from '@netproof/core';
import type { FrameCollectorProgress, FrameType } from '@netproof/core';
import { attachStream, requestCameraStream } from './camera';

/**
 * Continuous QR scanning from the camera.
 *
 * The scanner is deliberately decoupled from decoding policy: it hands every
 * decoded string to a `FrameCollector`, which tolerates garbage, foreign codes
 * and repeats. That is what lets a user wave the phone around while the other
 * screen animates, instead of having to line up one perfect shot.
 */

/**
 * How long a scan may fail before it starts trying harder.
 *
 * Long enough that a user who is still lining up the code never pays for it, short enough
 * to land while they are still holding the phone steady.
 */
const ROBUST_DECODE_AFTER_MS = 4000;

export interface ScanOptions {
  video: HTMLVideoElement;
  expectedType?: FrameType;
  /** Sampling canvas size; larger costs CPU but resolves denser codes. */
  scanSize?: number;
  /** Minimum gap between scans, in ms. */
  intervalMs?: number;
  /** Aborts a start that is still in flight, and releases the camera at once. */
  signal?: AbortSignal;
  onProgress: (progress: FrameCollectorProgress) => void;
  onComplete: (payload: Uint8Array) => void;
  onError?: (error: Error) => void;
}

export interface ScanHandle {
  stop: () => void;
  collector: FrameCollector;
}

export async function startQrScan(options: ScanOptions): Promise<ScanHandle> {
  const {
    video,
    expectedType,
    scanSize = 480,
    intervalMs = 60,
    signal,
    onProgress,
    onComplete,
    onError,
  } = options;

  const stream = await requestCameraStream();
  await attachStream(video, stream, signal);

  const collector = new FrameCollector(expectedType);
  const canvas = document.createElement('canvas');
  canvas.width = scanSize;
  canvas.height = scanSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建 2D 画布上下文');
  // A QR code must be sampled without smoothing or the modules blur together.
  context.imageSmoothingEnabled = false;

  let running = true;
  let lastScanAt = 0;
  let frameHandle = 0;
  let lastText = '';
  let lastTextAt = 0;
  const openedAt = Date.now();
  let decodedAny = false;

  const tick = (now: number): void => {
    if (!running) return;
    frameHandle = requestAnimationFrame(tick);
    if (now - lastScanAt < intervalMs) return;
    lastScanAt = now;
    try {
      const side = Math.min(video.videoWidth, video.videoHeight);
      if (side === 0) return;
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;
      context.drawImage(video, sx, sy, side, side, 0, 0, scanSize, scanSize);
      const image = context.getImageData(0, 0, scanSize, scanSize);
      /*
       * Start cheap and get thorough, rather than the reverse.
       *
       * `dontInvert` is half the work of `attemptBoth` and is right for a dark code on a
       * light screen, which is what both apps display. If nothing at all has been decoded
       * after a few seconds, though, the cheap assumption is the thing that is failing —
       * a strongly lit or reflective screen can invert a code's apparent polarity, and
       * "cannot scan it at all" is a much worse outcome than doubling the CPU cost of a
       * decode that is not succeeding anyway.
       */
      const robust = !decodedAny && Date.now() - openedAt > ROBUST_DECODE_AFTER_MS;
      const result = jsQR(image.data, image.width, image.height, {
        inversionAttempts: robust ? 'attemptBoth' : 'dontInvert',
      });
      if (!result || result.data.length === 0) return;
      decodedAny = true;
      // A held-still camera returns the same code many times per second; feed each
      // distinct code once, but re-feed after a while so a lost frame can be re-seen.
      if (result.data === lastText && now - lastTextAt < 900) return;
      lastText = result.data;
      lastTextAt = now;

      const progress = collector.addText(result.data);
      onProgress(progress);
      if (collector.complete) {
        onComplete(collector.result());
      }
    } catch (error) {
      onError?.(error as Error);
    }
  };

  frameHandle = requestAnimationFrame(tick);

  return {
    collector,
    stop: () => {
      running = false;
      cancelAnimationFrame(frameHandle);
      for (const track of stream.getTracks()) track.stop();
      if (video.srcObject === stream) video.srcObject = null;
    },
  };
}

/**
 * Decode a QR code from a still image file, so a signature can be relayed through
 * a screenshot when the cameras will not cooperate. Kept for the fallback path.
 */
export async function decodeImageFile(file: File, scanSize = 640): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = scanSize;
  canvas.height = scanSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  const side = Math.min(bitmap.width, bitmap.height);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, scanSize, scanSize);
  const image = context.getImageData(0, 0, scanSize, scanSize);
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return result?.data ?? null;
}
