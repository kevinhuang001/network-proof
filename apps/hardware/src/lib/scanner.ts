import jsQR from 'jsqr';
import { FrameCollector } from '@netproof/core';
import type { FrameCollectorProgress, FrameType } from '@netproof/core';
import { SHARP_WIDTH, attachStream, cameraInfo, requestCameraStream } from './camera';
import type { CameraInfo } from './camera';

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

/**
 * The largest crop handed to the decoder in the thorough mode.
 *
 * jsQR's cost grows with pixels, and on an old phone a 1080² decode takes a good fraction of a
 * second — which is why the cheap mode exists. But the cheap mode *downscales*: a 1080-line
 * frame reduced to a 480-pixel square throws away most of the detail a dense animated QR code
 * needs, so a phone that reports a sharp picture can still fail on a code a blurry phone would
 * read if it were only fed the pixels it has. This is the ceiling for the escalation.
 */
const DETAIL_CROP_MAX = 1080;

/**
 * How far the scan has actually got.
 *
 * This exists because of a specific lie the screen used to tell: the hint under the viewfinder
 * came from the *decode* progress, which does not exist until a frame has been read — so a
 * camera that was open, live and simply not seeing a code went on saying 「正在打开摄像头…」
 * for as long as the user was willing to believe it.
 */
export type ScanPhase = 'opening' | 'live' | 'searching';

export interface ScanStatus {
  phase: ScanPhase;
  /** What the camera gave us, once there is a stream. */
  info: CameraInfo | null;
}

export interface ScanOptions {
  video: HTMLVideoElement;
  expectedType?: FrameType;
  onStatus?: (status: ScanStatus) => void;
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
    onStatus,
    onComplete,
    onError,
  } = options;

  onStatus?.({ phase: 'opening', info: null });
  const stream = await requestCameraStream();
  await attachStream(video, stream, signal);
  onStatus?.({ phase: 'live', info: cameraInfo(stream) });

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
  let toldSearching = false;

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
      /*
       * Start cheap and get thorough, rather than the reverse.
       *
       * Two things change in the thorough mode, and both were failures of the cheap one:
       *
       *   - `dontInvert` is half the work of `attemptBoth` and is right for a dark code on a
       *     light screen, which is what both apps display. A strongly lit or reflective screen
       *     can invert a code's apparent polarity, though, and "cannot scan it at all" is a
       *     much worse outcome than doubling the cost of a decode that is not succeeding.
       *   - the crop is no longer downscaled. Feeding a 1080-line frame into a 480-pixel
       *     square is where a dense code's modules go to die.
       */
      const elapsed = Date.now() - openedAt;
      const robust = !decodedAny && elapsed > ROBUST_DECODE_AFTER_MS;
      if (robust && !toldSearching) {
        toldSearching = true;
        // Nothing has decoded after several seconds of live video. That is a fact worth
        // reporting while the user is still holding the phone, not after they give up.
        onStatus?.({ phase: 'searching', info: cameraInfo(stream) });
      }
      const crop = robust ? Math.min(side, DETAIL_CROP_MAX) : Math.min(scanSize, side);
      if (canvas.width !== crop) {
        canvas.width = crop;
        canvas.height = crop;
      }
      context.drawImage(video, sx, sy, side, side, 0, 0, crop, crop);
      const image = context.getImageData(0, 0, crop, crop);
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

/**
 * What to say under the viewfinder.
 *
 * Pure, and separated from the screen for one reason: this string is the only thing telling
 * the user whether to wait, move closer, or give up on the camera entirely, and it was wrong
 * in a way nobody could see from the code that renders it.
 */
export function scanHint(input: {
  status: ScanStatus | null;
  progress: FrameCollectorProgress | null;
}): string {
  if (input.progress !== null && input.progress.solved > 0) return input.progress.hint;
  if (input.status === null || input.status.phase === 'opening') return '正在打开摄像头…';
  if (input.status.phase === 'searching') {
    // The scanner has switched to full-resolution, polarity-agnostic decoding by now, so the
    // advice is about the only variables left in the user's hands.
    return '还没扫到（已切到精细识别）：两个屏幕靠近些、调高插件端亮度、拿稳';
  }
  return '把二维码放进取景框';
}

/** One line about the stream itself, so a soft picture has a number attached to it. */
export function scanCameraNote(info: CameraInfo | null): string | null {
  if (info === null || info.width === 0) return null;
  const size = `${info.width}×${info.height}`;
  if (info.width >= SHARP_WIDTH) return `摄像头 ${size}`;
  return `摄像头只有 ${size}，画面会偏糊，把二维码放近一点`;
}
