import jsQR from 'jsqr';
import { FrameCollector } from '@netproof/core';
import type { FrameCollectorProgress, FrameType } from '@netproof/core';
import { attachStream, cameraInfo, requestCameraStream } from './camera';
import { classifyQuality, frameQuality, grayscale, sharpness } from './frameQuality';
import type { FrameQuality } from './frameQuality';
import { estimateFinder, sizeAdvice } from './finderPattern';
import type { FinderEstimate } from './finderPattern';
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
 * How long a scan may fail before the app starts showing the user what it is looking at.
 *
 * Long enough that a normal scan never sees it, short enough to arrive while the person is still
 * holding the phone and wondering.
 */
const SAMPLE_AFTER_MS = 5000;

/**
 * How wide the snapshot may be displayed.
 *
 * It was 240 pixels of a 1080×1920 frame — a 4.5× reduction — and it was JPEG. The result was a
 * picture that looked like mush whatever the camera delivered, which cost a round of debugging:
 * 「为什么预览框里这么清楚，识别出来的这么模糊呢」 was a question about *my thumbnail*, not about
 * the frame. It is now captured at the resolution the decoder actually uses, cropped to the code
 * when one has been located, and encoded losslessly — so when it looks soft, the frame is soft.
 */
const SAMPLE_MAX = 420;

/**
 * Which pixels of a camera frame to hand the decoder.
 *
 * The whole frame, reduced only when it is too large to decode in a reasonable time. Cropping used
 * to be the optimisation here, and it was the bug: a preview and the frames a WebView gives
 * `drawImage` can disagree about orientation and cropping, so a centre square was somewhere else
 * on the screen than the square the user was aiming at. There is nothing to gain by being clever
 * about where the code is when the decoder can simply be given all of it.
 */
export function frameSampleSize(
  width: number,
  height: number,
  maxPixels = FRAME_MAX_PIXELS,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const pixels = width * height;
  if (pixels <= maxPixels) return { width, height };
  const scale = Math.sqrt(maxPixels / pixels);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

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
 * The most pixels one decode attempt may work on.
 *
 * 1080×1920 is 2.07 megapixels, which jsQR manages on an old phone in a fraction of a second; the
 * cap is here for a camera that reports something far larger, where the attempt would cost longer
 * than the frame it is looking at.
 */
const FRAME_MAX_PIXELS = 2_400_000;

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
  /**
   * The advice the scanner settled on, when it is one the hint line should repeat verbatim.
   *
   * 'FOCUS' is the case that matters: the code is the right size and the picture is too soft to
   * read it, which is a different conversation from "move closer" — and telling someone to move
   * closer when the problem is focus sends them the wrong way.
   */
  advice?: 'FOCUS' | 'NOT_FOUND' | null;
  /** Average neighbour-to-neighbour jump over the whole frame. Diluted by everything else in it. */
  sharpness?: number;
  /**
   * The same measurement over the code itself, which is the one that means something.
   *
   * Calibrated against a simulated 1080×1920 frame: a sharp code measures 28-43 over its own
   * region and 1-6 over the whole frame, because the whole frame is mostly not code. A number
   * without that distinction is a number nobody can act on.
   */
  codeSharpness?: number | null;
  /** Pixels handed to the decoder, for the diagnostics screen. */
  sampleSize?: { width: number; height: number };
  /** The located code's box inside those pixels. */
  codeSize?: { width: number; height: number } | null;
  /**
   * A picture of the exact crop that was handed to the decoder.
   *
   * The input to the failing component, shown to the person who can see the scene. Every other
   * diagnostic this app has describes that image; this is the image, and it is what settles
   * 「我看的二维码很清楚了，但还是识别不出来」 — what the eye sees across the room and what the
   * camera delivers are not the same picture.
   */
  sample?: string | null;
  /**
   * How big the code in front of the camera is, when a finder pattern can be found at all.
   *
   * This is what turns 「还没扫到」 into advice: whether to move closer is decided by pixels per
   * module, and nobody holding a phone can see that number.
   */
  estimate?: FinderEstimate | null;
}

/** What the last scan did, kept for the settings screen. */
export interface ScanReport {
  at: number;
  phase: ScanPhase;
  info: CameraInfo | null;
  /** Frames sampled since the camera opened. */
  frames: number;
  decoded: number;
  /**
   * Codes jsQR *did* find but the collector could not use.
   *
   * The difference between this and zero is the difference between "the camera cannot see a QR
   * code" and "it sees one that is not the transfer we are waiting for" — a wrong type, a
   * different transfer, or a misread frame. Those need opposite advice, and until this number
   * existed they looked identical from the outside.
   */
  rejected: number;
  /** Measured size of the code in view, when one could be measured. */
  estimate: FinderEstimate | null;
  /** Average neighbour-to-neighbour jump, for the diagnostics screen. */
  sharpness: number;
  /** The same, restricted to the located code, or null when no code was located. */
  codeSharpness: number | null;
  /** Pixels handed to the decoder. */
  sampleSize: { width: number; height: number };
  /** The located code's box inside those pixels. */
  codeSize: { width: number; height: number } | null;
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
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建 2D 画布上下文');
  /** A small copy of the crop, for the picture the diagnostics screen shows. */
  const preview = document.createElement('canvas');
  const previewContext = preview.getContext('2d');
  /** Only used to enlarge a crop that turned out to be too small to resolve. */
  const enlarged = document.createElement('canvas');
  const enlargedContext = enlarged.getContext('2d', { willReadFrequently: true });

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
  let rejectedFrames = 0;
  let lastFinderAt = 0;
  let lastAdvice: string | null = null;
  let lastSharpness = 0;
  let lastCodeSharpness: number | null = null;
  let lastEstimate: FinderEstimate | null = null;
  let lastSampleSize = { width: 0, height: 0 };
  let lastSampleAt = 0;

  /** Report a problem once, and never talk over the transfer once it is running. */
  const report = (
    phase: ScanStatus['phase'],
    estimate?: FinderEstimate | null,
    advice: 'FOCUS' | 'NOT_FOUND' | null = null,
    sample: string | null = null,
  ): void => {
    lastReport = {
      at: Date.now(),
      phase,
      info: cameraInfo(stream),
      frames,
      decoded: decodedFrames,
      rejected: rejectedFrames,
      estimate: estimate ?? null,
      sharpness: lastSharpness,
      codeSharpness: lastCodeSharpness,
      sampleSize: lastSampleSize,
      codeSize: codeBox(lastEstimate),
    };
    if (lastVerdict === phase && estimate === undefined) return;
    lastVerdict = phase;
    onStatus?.({
      phase,
      info: cameraInfo(stream),
      advice,
      sharpness: lastSharpness,
      codeSharpness: lastCodeSharpness,
      sampleSize: lastSampleSize,
      codeSize: codeBox(lastEstimate),
      sample,
      ...(estimate === undefined ? {} : { estimate }),
    });
  };

  const tick = (now: number): void => {
    if (!running) return;
    frameHandle = requestAnimationFrame(tick);
    if (now - lastScanAt < intervalMs) return;
    lastScanAt = now;
    try {
      /*
       * Everything the camera delivers, not a square carved out of the middle.
       *
       * The square was the bug. A preview on a phone can disagree with the frames a WebView hands
       * to `drawImage` about orientation and cropping, and when it does, a centre square is a
       * region somewhere else entirely: the user's report was 「镜头放在二维码的上面好多才可以
       * 识别到」 — the only way to get the code into the sampled square was to aim well above it.
       * A decoder that samples the whole frame does not care where the picture is; jsQR finds a
       * code anywhere in an image, at any rotation, and the frame is 2 megapixels, which one
       * attempt per frame can afford now that the code is static and there is no race to lose.
       */
      const { width: sampleWidth, height: sampleHeight } = frameSampleSize(
        video.videoWidth,
        video.videoHeight,
      );
      if (sampleWidth === 0 || sampleHeight === 0) return;
      if (canvas.width !== sampleWidth || canvas.height !== sampleHeight) {
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
      }
      const scale = sampleWidth / video.videoWidth;
      // Smoothing is the correct way to reduce an image, and must stay off at 1:1 where there is
      // nothing to interpolate.
      context.imageSmoothingEnabled = scale < 1;
      context.imageSmoothingQuality = 'high';
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, sampleWidth, sampleHeight);
      const image = context.getImageData(0, 0, sampleWidth, sampleHeight);
      lastSampleSize = { width: sampleWidth, height: sampleHeight };

      const elapsed = Date.now() - openedAt;
      const robust = !decodedAny && elapsed > ROBUST_DECODE_AFTER_MS;
      if (robust && !toldSearching) {
        toldSearching = true;
        // Nothing has decoded after live video started. Worth saying while the user is still
        // holding the phone, not after they give up.
        report('searching');
      }

      /*
       * A picture of the input, once the scan has been failing long enough for someone to be
       * wondering why. Small and JPEG, because it is drawn by the same phone that is decoding.
       */
      let sample: string | null = null;
      if (!decodedAny && elapsed > SAMPLE_AFTER_MS && now - lastSampleAt > 1000 && previewContext) {
        lastSampleAt = now;
        /*
         * The code when we have found it, the whole frame when we have not. The first shows
         * whether the modules are clean; the second shows whether the code is in the picture at
         * all, which is the question when nothing has been located.
         */
        /*
         * The whole frame, the same framing the preview shows.
         *
         * It used to be cropped to the code the app thought it had found, which was reported —
         * correctly — as 「实际拍到的只是预览框里的一角」: a false detection in a corner became the
         * picture the user was asked to judge. Now the picture is the frame, and if a code has been
         * located it is *outlined* rather than cropped to, so what the app believes is visible
         * instead of being applied silently.
         */
        const fit = Math.min(1, SAMPLE_MAX / Math.max(sampleWidth, sampleHeight, 1));
        preview.width = Math.max(1, Math.round(sampleWidth * fit));
        preview.height = Math.max(1, Math.round(sampleHeight * fit));
        previewContext.imageSmoothingEnabled = fit < 1;
        previewContext.imageSmoothingQuality = 'high';
        previewContext.drawImage(
          canvas,
          0,
          0,
          sampleWidth,
          sampleHeight,
          0,
          0,
          preview.width,
          preview.height,
        );
        const region = lastEstimate?.region ?? null;
        if (region) {
          previewContext.strokeStyle = '#0ECB81';
          previewContext.lineWidth = Math.max(2, Math.round(preview.width / 160));
          previewContext.strokeRect(
            region.left * fit,
            region.top * fit,
            (region.right - region.left) * fit,
            (region.bottom - region.top) * fit,
          );
        }
        try {
          // Lossless: a JPEG artefact would be indistinguishable from a soft lens.
          sample = preview.toDataURL('image/png');
        } catch {
          sample = null;
        }
      }

      frames += 1;
      /*
       * Measure the code while waiting for it.
       *
       * Every 400 ms, and only until something decodes: this is the sentence the user needs
       * ("closer" or "not the distance"), and it is the difference between a screen that is silent
       * and one that tells them which way to move.
       */
      if (!decodedAny && now - lastFinderAt > 400) {
        lastFinderAt = now;
        const gray = grayscale(image.data, sampleWidth * sampleHeight);
        const estimate = estimateFinder(gray, sampleWidth, sampleHeight);
        lastSharpness = sharpness(gray, sampleWidth, sampleHeight);
        /*
         * Sharpness where it means something. Over a whole 1080×1920 frame a *sharp* code measures
         * 1-6, because the frame is mostly not code; over the code itself it measures 28-43.
         * Reporting the first number as "sharpness" was reporting the weather in another city.
         */
        lastCodeSharpness =
          estimate?.region == null
            ? null
            : sharpness(gray, sampleWidth, sampleHeight, estimate.region);
        /*
         * Focus before distance. A picture too soft to hold a code is one that no advice about
         * distance can help, and "the size is fine" would send the user looking in the wrong place
         * — which is exactly what happened.
         */
        const advice = adviceFor({
          estimate,
          codeSharpness: lastCodeSharpness,
          robust,
        });
        lastEstimate = estimate;
        if (advice !== lastAdvice || sample !== null) {
          lastAdvice = advice;
          report(
            robust ? 'searching' : 'live',
            estimate,
            advice === 'FOCUS' ? 'FOCUS' : null,
            sample,
          );
        }
      }

      if (!decodedAny) {
        quality.push(frameQuality(image.data));
        if (quality.length > 24) quality.shift();
        const verdict = classifyQuality(quality);
        if (verdict === 'dark' || verdict === 'blank' || verdict === 'frozen') report(verdict);
      }

      let result = jsQR(image.data, image.width, image.height, {
        inversionAttempts: robust ? 'attemptBoth' : 'dontInvert',
      });

      if (!result && robust && !decodedAny) {
        /*
         * One enlarged attempt, for a code that occupies few pixels.
         *
         * jsQR's locating and thresholding both work in pixels, and a code under about three
         * pixels per module is not found at any cost. Interpolation cannot invent detail, but it
         * gives the binarizer the pixels it wants: against a simulated camera this rescued codes
         * at 2.5 pixels per module that were unreadable as they stood. Only when the frame is
         * small enough for the result to still be cheap.
         */
        const enlarged2 = frameSampleSize(sampleWidth * 2, sampleHeight * 2);
        if (enlarged2.width * enlarged2.height <= DETAIL_CROP_MAX * DETAIL_CROP_MAX * 4 && enlargedContext) {
          enlarged.width = enlarged2.width;
          enlarged.height = enlarged2.height;
          enlargedContext.imageSmoothingEnabled = true;
          enlargedContext.imageSmoothingQuality = 'high';
          enlargedContext.drawImage(canvas, 0, 0, sampleWidth, sampleHeight, 0, 0, enlarged2.width, enlarged2.height);
          const bigger = enlargedContext.getImageData(0, 0, enlarged2.width, enlarged2.height);
          result = jsQR(bigger.data, bigger.width, bigger.height, { inversionAttempts: 'attemptBoth' });
        }
      }

      if (!result || result.data.length === 0) return;
      decodedFrames += 1;
      decodedAny = true;
      // A held-still camera returns the same code many times per second; feed each
      // distinct code once, but re-feed after a while so a lost frame can be re-seen.
      if (result.data === lastText && now - lastTextAt < 900) return;
      lastText = result.data;
      lastTextAt = now;

      const progress = collector.addText(result.data);
      if (progress.rejectedFrames > rejectedFrames) rejectedFrames = progress.rejectedFrames;
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

/** The located code's box in the sampled pixels, or null when nothing was located. */
function codeBox(estimate: FinderEstimate | null): { width: number; height: number } | null {
  if (estimate?.region == null) return null;
  return {
    width: estimate.region.right - estimate.region.left,
    height: estimate.region.bottom - estimate.region.top,
  };
}

/**
 * The advice, decided from measurements in the order that can be trusted.
 *
 * Separated from the loop and pure, because this sentence is the only feedback the user gets and
 * it has already been wrong twice: it told people to move closer when the problem was focus, and
 * it said nothing at all when the camera could not find a code to measure.
 */
export function adviceFor(input: {
  estimate: FinderEstimate | null;
  codeSharpness: number | null;
  robust: boolean;
}): string | null {
  if (!input.robust) return null;
  if (input.estimate === null) {
    // Nothing code-shaped in the frame. Not a distance problem: there is nothing to be close to.
    return 'NOT_FOUND';
  }
  if (input.codeSharpness !== null && input.codeSharpness < CODE_SHARP_ENOUGH) {
    return 'FOCUS';
  }
  return sizeAdvice(input.estimate);
}

/**
 * Below this, the code's own region is too soft for the modules to survive.
 *
 * Calibrated against a simulated 1080×1920 frame: a cleanly rendered code measures 28-43 over its
 * own region, and blur takes it under 20. The whole-frame number this replaced measured 1-6 for
 * the *same* sharp code, so no threshold on it could have meant anything.
 */
export const CODE_SHARP_ENOUGH = 20;

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
  /*
   * A code was read and could not be used: wrong type, a different transfer, a misread frame.
   * Telling this user to move closer would be advice about the wrong problem.
   */
  if (input.progress !== null && input.progress.solved === 0 && input.progress.rejectedFrames > 3) {
    return '扫到的是别的二维码：确认插件端显示的就是这次要签名的请求';
  }
  const phase = input.status?.phase ?? 'opening';
  switch (phase) {
    case 'opening':
      return '正在打开摄像头…';
    case 'live':
      return sizeAdvice(input.status?.estimate ?? null) ?? '把二维码放进取景框';
    case 'searching':
      /*
       * Measured, not guessed, and in the order the measurements deserve: a picture too soft to
       * hold a code comes first, because "the size is fine" is then true and useless.
       */
      if (input.status?.advice === 'FOCUS') {
        return '画面太糊，对不上焦：擦一下镜头，再试试 20–40 厘米的距离（有些老手机离太近对不上焦）';
      }
      return (
        sizeAdvice(input.status?.estimate ?? null) ??
        '还没扫到：把两个屏幕靠近些、调高插件端亮度、拿稳'
      );
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
