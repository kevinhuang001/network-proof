import jsQR from 'jsqr';
import { FrameCollector } from '@netproof/core';
import type { FrameCollectorProgress, FrameType } from '@netproof/core';
import { attachStream, cameraInfo, requestCameraStream } from './camera';
import { SHARP_ENOUGH, classifyQuality, frameQuality, grayscale, sharpness } from './frameQuality';
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
 * The square the user is told to fill, as a fraction of the sampled square.
 *
 * The reticle is 72% of the viewfinder, so that is where the code is when the user does what the
 * screen says. Sampling that region first halves the pixels the decoder has to chew through —
 * which, on a phone that manages about one decode a second, is one more attempt a second.
 * The full square is still tried when the reticle fails, for a code held off-centre.
 */
const RETICLE_FRACTION = 0.72;

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
  /**
   * The advice the scanner settled on, when it is one the hint line should repeat verbatim.
   *
   * 'FOCUS' is the case that matters: the code is the right size and the picture is too soft to
   * read it, which is a different conversation from "move closer" — and telling someone to move
   * closer when the problem is focus sends them the wrong way.
   */
  advice?: 'FOCUS' | null;
  /** Average neighbour-to-neighbour jump: how well the lens is focused. */
  sharpness?: number;
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
  let lastSampleAt = 0;

  /** Report a problem once, and never talk over the transfer once it is running. */
  const report = (
    phase: ScanStatus['phase'],
    estimate?: FinderEstimate | null,
    advice: 'FOCUS' | null = null,
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
    };
    if (lastVerdict === phase && estimate === undefined) return;
    lastVerdict = phase;
    onStatus?.({
      phase,
      info: cameraInfo(stream),
      advice,
      sharpness: lastSharpness,
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
      /*
       * Sample the middle square at the camera's own resolution.
       *
       * There used to be a "fast" mode that shrank this to 480 first, with smoothing off, on
       * the theory that fewer pixels is cheaper. Two things were wrong with it. Shrinking a
       * periodic image with nearest-neighbour sampling is not a smaller picture of a QR code,
       * it is a moiré pattern — measured against a simulated camera, it failed on codes the
       * smoothed path read. And the pixels it threw away are exactly the ones a phone camera
       * has least of: at 480, a code filling the frame lands at four pixels per module, and
       * four is where jsQR stops.
       */
      /*
       * Two windows, reticle first.
       *
       * `draw` returns the sampled image and how many source pixels it covers, so the caller can
       * try the second window only if the first found nothing.
       */
      const draw = (fraction: number): { image: ImageData; source: number } => {
        const source = Math.max(16, Math.round(side * fraction));
        const crop = Math.min(source, DETAIL_CROP_MAX);
        if (canvas.width !== crop) {
          canvas.width = crop;
          canvas.height = crop;
        }
        // Smoothing is the *correct* way to reduce an image, and must stay off at 1:1 where
        // there is nothing to interpolate.
        context.imageSmoothingEnabled = crop < source;
        context.imageSmoothingQuality = 'high';
        const left = sx + (side - source) / 2;
        const top = sy + (side - source) / 2;
        context.drawImage(video, left, top, source, source, 0, 0, crop, crop);
        return { image: context.getImageData(0, 0, crop, crop), source };
      };

      let { image, source: crop } = draw(RETICLE_FRACTION);

      /*
       * How the frame looks, before asking whether it contains a code.
       *
       * A covered lens, a frozen preview and a code that is merely dense produce the same
       * silence from jsQR, and the user can only act on the first two if we name them.
       */
      frames += 1;
      /*
       * Measure the code while waiting for it.
       *
       * Every 400 ms, and only until something decodes: this is the sentence the user needs
       * ("closer" or "not the distance"), and it is the difference between a screen that is
       * silent and one that tells them which way to move.
       */
      if (!decodedAny && now - lastFinderAt > 400) {
        lastFinderAt = now;
        const gray = grayscale(image.data, crop * crop);
        const estimate = estimateFinder(gray, crop, crop);
        lastSharpness = sharpness(gray, crop, crop);
        /*
         * Focus first. A picture too soft to hold a code is one that no advice about distance can
         * help, and "the size is fine" would send the user looking in the wrong place — which is
         * exactly what happened.
         */
        const advice =
          lastSharpness < SHARP_ENOUGH && elapsed > ROBUST_DECODE_AFTER_MS ? 'FOCUS' : sizeAdvice(estimate);
        /*
         * A picture of the input, every second or so, once the scan has been failing long enough
         * for someone to be wondering why. Small (240px) and JPEG, because this is drawn on the
         * same phone that is trying to decode.
         */
        let sample: string | null = null;
        if (elapsed > SAMPLE_AFTER_MS && now - lastSampleAt > 1000 && previewContext) {
          lastSampleAt = now;
          const side240 = 240;
          preview.width = side240;
          preview.height = side240;
          previewContext.imageSmoothingEnabled = true;
          previewContext.drawImage(canvas, 0, 0, image.width, image.height, 0, 0, side240, side240);
          try {
            sample = preview.toDataURL('image/jpeg', 0.6);
          } catch {
            sample = null;
          }
        }

        if (advice !== lastAdvice || sample !== null) {
          lastAdvice = advice;
          report(
            elapsed > ROBUST_DECODE_AFTER_MS ? 'searching' : 'live',
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

      /*
       * Enlarge before giving up.
       *
       * jsQR's locating and thresholding both work in pixels, and a code under about three
       * pixels per module is not found at any cost. Interpolation cannot invent detail, but it
       * does give the binarizer the pixels it wants to see: against a simulated camera this
       * rescued codes at 2.5 pixels per module that were unreadable as they stood.
       *
       * Only for small crops: enlarging a 1080-pixel square fourfold would cost seconds of
       * decoding for a code that already had every pixel it needed.
       */
      if (!result && !decodedAny) {
        // The code may be outside the reticle — the user may be holding it high or low. Half a
        // second of decoding is worth it before telling them to move.
        if (crop < side) {
          const wider = draw(1);
          image = wider.image;
          crop = wider.source;
          result = jsQR(image.data, image.width, image.height, {
            inversionAttempts: robust ? 'attemptBoth' : 'dontInvert',
          });
        }
      }

      if (!result && robust && crop * 2 <= DETAIL_CROP_MAX && enlargedContext) {
        const target = crop * 2;
        enlarged.width = target;
        enlarged.height = target;
        enlargedContext.imageSmoothingEnabled = true;
        enlargedContext.imageSmoothingQuality = 'high';
        enlargedContext.drawImage(canvas, 0, 0, crop, crop, 0, 0, target, target);
        const bigger = enlargedContext.getImageData(0, 0, target, target);
        result = jsQR(bigger.data, target, target, { inversionAttempts: 'attemptBoth' });
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
