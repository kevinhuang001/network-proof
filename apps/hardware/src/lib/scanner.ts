import jsQR from 'jsqr';
import { FrameCollector } from '@netproof/core';
import type { FrameCollectorProgress, FrameType } from '@netproof/core';
import { attachStream, cameraInfo, requestCameraStream } from './camera';
import { classifyQuality, frameQuality } from './frameQuality';
import type { FrameQuality } from './frameQuality';
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
const ROBUST_DECODE_AFTER_MS = 1500;

/**
 * How long a stream may deliver no frames at all before that is reported as a problem.
 *
 * `videoWidth === 0` forever is what a stalled WebView preview looks like: no error, no
 * exception, no picture, and — before this — nothing on screen to say so.
 */
const NO_SIGNAL_AFTER_MS = 3000;

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
export type ScanPhase = 'opening' | 'live' | 'searching' | 'no-signal' | 'dark' | 'blank' | 'frozen';

export interface ScanStatus {
  phase: ScanPhase;
  /** What the camera gave us, once there is a stream. */
  info: CameraInfo | null;
}

/** What the last scan did, kept for the settings screen. */
export interface ScanReport {
  at: number;
  phase: ScanPhase;
  info: CameraInfo | null;
  /** Frames sampled since the camera opened. */
  frames: number;
  decoded: number;
}

let lastReport: ScanReport | null = null;

/**
 * The last scan, for the diagnostics screen.
 *
 * Not shown while scanning — a resolution under a viewfinder is a number to read at the wrong
 * moment — but it is the first thing anyone asked to help needs to know, and asking the user to
 * describe a blur is not a debugging method.
 */
export function lastScanReport(): ScanReport | null {
  return lastReport;
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
  const quality: FrameQuality[] = [];
  let lastVerdict: ScanStatus['phase'] | null = null;
  let frames = 0;
  let decodedFrames = 0;

  /** Report a problem once, and never talk over the transfer once it is running. */
  const report = (phase: ScanStatus['phase']): void => {
    lastReport = { at: Date.now(), phase, info: cameraInfo(stream), frames, decoded: decodedFrames };
    if (lastVerdict === phase) return;
    lastVerdict = phase;
    onStatus?.({ phase, info: cameraInfo(stream) });
  };

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
        // Nothing has decoded after live video started. That is a fact worth reporting while
        // the user is still holding the phone, not after they give up.
        report('searching');
      }
      const crop = robust ? Math.min(side, DETAIL_CROP_MAX) : Math.min(scanSize, side);
      if (canvas.width !== crop) {
        canvas.width = crop;
        canvas.height = crop;
      }
      context.drawImage(video, sx, sy, side, side, 0, 0, crop, crop);
      const image = context.getImageData(0, 0, crop, crop);

      /*
       * How the frame looks, before asking whether it contains a code.
       *
       * A covered lens, a frozen preview and a code that is merely dense produce the same
       * silence from jsQR, and the user can only act on the first two if we name them.
       */
      frames += 1;
      if (!decodedAny) {
        quality.push(frameQuality(image.data));
        if (quality.length > 24) quality.shift();
        const verdict = classifyQuality(quality);
        if (verdict === 'dark' || verdict === 'blank' || verdict === 'frozen') report(verdict);
      }

      const result = jsQR(image.data, image.width, image.height, {
        inversionAttempts: robust ? 'attemptBoth' : 'dontInvert',
      });
      if (!result || result.data.length === 0) return;
      decodedFrames += 1;
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

  /*
   * Nothing has arrived at all.
   *
   * `tick` returns silently while `videoWidth` is 0, so a preview that never starts produced no
   * error, no hint change and no progress — the exact shape of 「一直没反应」. This says it out
   * loud instead, once, three seconds in.
   */
  const watchdog = window.setTimeout(() => {
    if (!running || decodedAny) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      report('no-signal');
      onError?.(new Error('摄像头已打开，但没有拿到任何画面。请退出后重试，或重启手机。'));
    }
  }, NO_SIGNAL_AFTER_MS);

  return {
    collector,
    stop: () => {
      window.clearTimeout(watchdog);
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
  const phase = input.status?.phase ?? 'opening';
  switch (phase) {
    case 'opening':
      return '正在打开摄像头…';
    case 'live':
      return '把二维码放进取景框';
    case 'searching':
      // The scanner has switched to full-resolution, polarity-agnostic decoding by now, so the
      // advice is about the only variables left in the user's hands.
      return '还没扫到：两个屏幕靠近些、调高插件端亮度、拿稳';
    case 'no-signal':
      return '摄像头打开了，但没有画面——退出这一步重进，或重启手机';
    case 'dark':
      return '画面几乎全黑：镜头可能被挡住了，或者环境太暗';
    case 'blank':
      return '画面没有对比度：镜头离屏幕太近或太亮，拿远一点、降低插件端亮度';
    case 'frozen':
      return '画面卡住不动了：退出这一步重进（摄像头没有在出新画面）';
    default:
      return '把二维码放进取景框';
  }
}
