import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedQr } from '../lib/qrrender';

/**
 * Animated QR display. Frames are precomputed once and then looped forever, so a
 * receiver that missed the beginning can simply keep scanning: the fountain code
 * makes frame order irrelevant.
 */
export function QrDisplay({
  frames,
  frameDurationMs,
  caption,
  onCycle,
}: {
  frames: string[];
  frameDurationMs?: number;
  caption?: string;
  onCycle?: (cycle: number) => void;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<AnimatedQr | null>(null);
  const [progress, setProgress] = useState({ index: 0, total: frames.length });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const animation = new AnimatedQr(frames, {
      canvas,
      ...(frameDurationMs !== undefined ? { frameDurationMs } : {}),
      onFrame: (index, total) => setProgress({ index, total }),
      ...(onCycle ? { onCycle } : {}),
    });
    animationRef.current = animation;
    animation.start();

    const onResize = (): void => animation.repaint();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      animation.stop();
      animationRef.current = null;
    };
    // `frames` identity is stable per transfer; re-creating on every render would
    // restart the animation and make the code impossible to scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, frameDurationMs]);

  return (
    <div className="np-stack">
      <div className="np-qr-stage">
        <canvas ref={canvasRef} aria-label="二维码" />
      </div>
      <div className="np-row np-row--between">
        <span className="np-qr-caption">{caption ?? '请用另一台设备扫描'}</span>
        {progress.total > 1 ? (
          <span className="np-badge">
            {progress.index + 1}/{progress.total}
          </span>
        ) : null}
      </div>
      {progress.total > 1 ? (
        <div className="np-body np-body--tight np-center">
          动画二维码 · 无需按顺序，扫到足够帧数即可完成
        </div>
      ) : null}
    </div>
  );
}

/**
 * Camera preview with the scan reticle. The parent owns the scanning loop; this
 * component only provides the video element and the frame chrome.
 */
export function CameraStage({
  videoRef,
  hint,
  progressLabel,
  progressValue,
  tone,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hint: string;
  progressLabel?: string;
  progressValue?: number;
  tone?: 'neutral' | 'up';
}): ReactNode {
  return (
    <div className="np-stack">
      <div className="np-camera">
        <video ref={videoRef} playsInline muted autoPlay />
        <div className="np-camera__overlay">
          <div className="np-scan-frame" />
        </div>
      </div>
      {progressValue !== undefined ? (
        <div className="np-stack" style={{ gap: 6 }}>
          <div className="np-row np-row--between">
            <span className="np-body np-body--tight">{progressLabel ?? '接收进度'}</span>
            <span className="np-badge np-badge--accent">{Math.round(progressValue * 100)}%</span>
          </div>
          <div className={`np-progress${tone === 'up' ? ' np-progress--up' : ''}`}>
            <div className="np-progress__bar" style={{ width: `${Math.min(100, progressValue * 100)}%` }} />
          </div>
        </div>
      ) : null}
      <div className="np-body np-body--tight np-center">{hint}</div>
    </div>
  );
}
