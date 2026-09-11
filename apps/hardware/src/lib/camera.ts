import { CameraNoiseCollector, toGrayscale } from '@netproof/core';
import type { CollectorStats, GrayscaleFrame } from '@netproof/core';

/**
 * Live camera entropy capture.
 *
 * Two details here matter more than they look:
 *
 * 1. We crop a 1:1 region out of the video frame instead of downscaling the whole
 *    frame. Downscaling interpolates neighbouring pixels together, which averages
 *    away exactly the sensor noise we are trying to harvest.
 * 2. `imageSmoothingEnabled = false` for the same reason.
 *
 * A third, unavoidable caveat is documented for the user: some phone camera
 * pipelines apply temporal noise reduction before the WebView ever sees the
 * pixels. If that happens, the measured entropy per frame collapses and the app
 * refuses to create a wallet rather than inventing randomness — which is the
 * behaviour we want, and why the capture screen shows a live bits/second number.
 */

export interface CaptureOptions {
  video: HTMLVideoElement;
  collector: CameraNoiseCollector;
  /** Side length of the 1:1 crop, in source pixels. */
  sampleSize?: number;
  /** Minimum gap between sampled frames, in ms. */
  frameIntervalMs?: number;
  /** Aborts a start that is still in flight, and releases the camera at once. */
  signal?: AbortSignal;
  onFrame?: (info: { contribution: ReturnType<CameraNoiseCollector['addFrame']>; stats: CollectorStats }) => void;
  onError?: (error: Error) => void;
}

export interface CaptureHandle {
  stop: () => void;
  /** Resolves once the media stream has been released. */
  done: Promise<void>;
}

export function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** Mark an error as "we cancelled this ourselves", so callers can ignore it. */
export function abortError(): Error {
  const error = new Error('camera start was cancelled');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Attach a stream to the video element and start playing, surviving a teardown.
 *
 * `video.play()` rejects with `AbortError: The play() request was interrupted by a new
 * load request` whenever `srcObject` is assigned again before the promise settles. React
 * StrictMode mounts every effect twice in development, and both mounts call this, so the
 * first attempt is *always* interrupted — and its rejection used to be shown to the user
 * as "无法打开摄像头", on a camera that was in fact open and about to work. The same
 * interruption happens for real whenever the user leaves the screen mid-permission-prompt,
 * which also used to leak an open camera: the captured stream was still running, on a
 * device whose entire premise is that the camera is not quietly doing things.
 */
export async function attachStream(
  video: HTMLVideoElement,
  stream: MediaStream,
  signal?: AbortSignal,
): Promise<void> {
  const release = (): void => {
    for (const track of stream.getTracks()) track.stop();
    if (video.srcObject === stream) video.srcObject = null;
  };
  if (signal?.aborted) {
    release();
    throw abortError();
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch (error) {
    // A refusal we should report is a policy refusal; an interrupted play() means
    // somebody replaced the source, which is exactly what a cancelled attempt does.
    if (!isAbortError(error)) {
      release();
      throw error;
    }
  }
  // Whoever owns the element now, it is not this attempt: hand the camera back.
  if (signal?.aborted || video.srcObject !== stream) {
    release();
    throw abortError();
  }
}

/** Request the rear camera. Throws a readable error the UI can show verbatim. */
export async function requestCameraStream(): Promise<MediaStream> {
  if (!cameraSupported()) {
    throw new Error('此设备/浏览器不支持摄像头接口 (getUserMedia)。请使用 Android 版或在 https 环境下打开。');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // Ask for the highest frame rate we can get: more frames means more
        // independent noise samples per second.
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
  } catch (error) {
    const name = (error as { name?: string }).name ?? '';
    if (name === 'NotAllowedError') {
      throw new Error('摄像头权限被拒绝。请在系统设置中允许 NetProof Air 使用摄像头。');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new Error('未找到可用摄像头。');
    }
    throw new Error(`无法打开摄像头：${(error as Error).message}`);
  }
}

export async function startEntropyCapture(options: CaptureOptions): Promise<CaptureHandle> {
  const {
    video,
    collector,
    sampleSize = 256,
    frameIntervalMs = 33,
    signal,
    onFrame,
    onError,
  } = options;

  const stream = await requestCameraStream();
  await attachStream(video, stream, signal);

  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建 2D 画布上下文');
  context.imageSmoothingEnabled = false;

  let running = true;
  let lastSampleAt = 0;
  let frameHandle = 0;

  const tick = (now: number): void => {
    if (!running) return;
    frameHandle = requestAnimationFrame(tick);
    if (now - lastSampleAt < frameIntervalMs) return;
    lastSampleAt = now;
    try {
      const sourceSide = Math.min(video.videoWidth, video.videoHeight);
      if (sourceSide === 0) return; // metadata not ready yet
      const sx = (video.videoWidth - sourceSide) / 2;
      const sy = (video.videoHeight - sourceSide) / 2;
      // 1:1 crop of the centre, so no interpolation touches the pixels.
      const side = Math.min(sampleSize, sourceSide);
      context.drawImage(video, sx, sy, sourceSide, sourceSide, 0, 0, side, side);
      const image = context.getImageData(0, 0, side, side);
      const frame: GrayscaleFrame = toGrayscale(image.data, side, side, 4);
      frame.timestamp = now;
      const contribution = collector.addFrame(frame);
      onFrame?.({ contribution, stats: collector.stats() });
    } catch (error) {
      onError?.(error as Error);
    }
  };

  frameHandle = requestAnimationFrame(tick);

  const done = new Promise<void>((resolve) => {
    const cleanup = (): void => {
      cancelAnimationFrame(frameHandle);
      for (const track of stream.getTracks()) track.stop();
      // Only detach the source this attempt installed; a newer one may own the element.
      if (video.srcObject === stream) video.srcObject = null;
      resolve();
    };
    stream.getVideoTracks()[0]?.addEventListener('ended', cleanup);
    // `stop()` triggers cleanup through this reference.
    stopInternal = cleanup;
  });

  let stopInternal: () => void = () => {
    running = false;
    for (const track of stream.getTracks()) track.stop();
    if (video.srcObject === stream) video.srcObject = null;
  };

  return {
    stop: () => {
      running = false;
      stopInternal();
    },
    done,
  };
}
