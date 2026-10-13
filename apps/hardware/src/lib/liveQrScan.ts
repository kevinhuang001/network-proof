import jsQR from 'jsqr';
import { requestCameraStream, attachStream } from './camera';

/** Continuous offline QR decoding. No frame, image or request ever leaves this device. */
export function shouldAcceptFrame(text: string, previousText: string, now: number, previousAt: number): boolean {
  return text.length > 0 && (text !== previousText || now - previousAt >= 1000);
}

export interface LiveScanHandle {
  stop(): void;
}

export async function startLiveQrScan(
  video: HTMLVideoElement,
  onCode: (text: string) => void,
  onError: (message: string) => void,
  signal?: AbortSignal,
): Promise<LiveScanHandle> {
  const stream = await requestCameraStream();
  try {
    await attachStream(video, stream, signal);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    throw new Error('无法初始化二维码解码器');
  }
  let stopped = false;
  let frame = 0;
  let lastDecode = 0;
  let lastText = '';
  let lastTextAt = 0;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((track) => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
    signal?.removeEventListener('abort', stop);
  };
  const tick = (now: number): void => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (now - lastDecode < 130 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    lastDecode = now;
    try {
      // Decode the whole sensor image: center-cropping silently misses off-center codes.
      // Keep enough source pixels for dense payloads without allocating a 4K RGBA buffer.
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;
      const scale = Math.min(1, 1280 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.imageSmoothingEnabled = true;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      if (!result?.data) return;
      // Avoid redundant work on static QR codes; repeated animated frames remain accepted.
      if (!shouldAcceptFrame(result.data, lastText, now, lastTextAt)) return;
      lastText = result.data;
      lastTextAt = now;
      onCode(result.data);
    } catch (error) {
      onError((error as Error).message);
      stop();
    }
  };
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  else frame = requestAnimationFrame(tick);
  return { stop };
}
