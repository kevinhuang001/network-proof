import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CameraNoiseCollector } from '@netproof/core';
import type { CollectorStats, EntropyResult } from '@netproof/core';
import { Alert, Button, Header, ProgressBar, haptic } from '../components/primitives';
import { startEntropyCapture, cameraSupported } from '../lib/camera';
import type { CaptureHandle } from '../lib/camera';

/**
 * Step 1 of wallet creation: harvest true randomness from the camera sensor.
 *
 * The screen's job is to make an invisible physical process legible: the user sees
 * raw bits accumulating, the frames per second, and — critically — whether the
 * sensor is actually noisy. A covered lens or a denoised preview shows up as a
 * stalled progress bar with an explanation, instead of a silently weak seed.
 */
export function CaptureScreen({
  requiredBits,
  onComplete,
  onCancel,
}: {
  requiredBits: number;
  onComplete: (result: EntropyResult) => void;
  onCancel: () => void;
}): ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureRef = useRef<CaptureHandle | null>(null);
  const collectorRef = useRef<CameraNoiseCollector | null>(null);
  const [stats, setStats] = useState<CollectorStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const collector = new CameraNoiseCollector({
      requiredBits,
      minFrames: 24,
      minDurationMs: 1200,
      // Mix the host CSPRNG in as defence in depth. It never earns entropy credit.
      includeDeviceCsprng: true,
    });
    collectorRef.current = collector;

    void (async () => {
      try {
        const handle = await startEntropyCapture({
          video: videoRef.current!,
          collector,
          sampleSize: 256,
          frameIntervalMs: 33,
          onFrame: ({ stats: next }) => {
            if (!cancelled) setStats(next);
          },
          onError: (caught) => {
            if (!cancelled) setError(caught.message);
          },
        });
        if (cancelled) {
          handle.stop();
          return;
        }
        captureRef.current = handle;
      } catch (caught) {
        if (!cancelled) setError((caught as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      captureRef.current?.stop();
      captureRef.current = null;
    };
  }, [started, requiredBits]);

  // Touch samples are mixed into the transcript. They grant no entropy credit,
  // but they make the seed depend on the user's hand as well as the sensor.
  const recordTouch = (event: React.PointerEvent<HTMLDivElement>): void => {
    collectorRef.current?.addInteraction({
      timestamp: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    });
  };

  /**
   * Finish the capture and derive the mnemonic.
   *
   * This used to be able to fail *invisibly*: `finalize()` threw, `setError` put the
   * message at the top of a page whose visible area was filled by the camera
   * preview, and the user — looking at the button in the sticky footer — saw
   * nothing happen at all. The error now renders in the footer, right where the
   * user is looking, and a failure offers an explicit way forward.
   */
  const finish = (): void => {
    const collector = collectorRef.current;
    if (!collector) {
      setError('采集器尚未就绪，请重新打开摄像头后再试。');
      return;
    }
    setFinishing(true);
    setError(null);
    try {
      const result = collector.finalize();
      captureRef.current?.stop();
      onComplete(result);
    } catch (caught) {
      setError((caught as Error).message);
      setFinishing(false);
      haptic([20, 60, 20]);
    }
  };

  const retry = (): void => {
    setError(null);
    setFinishing(false);
    collectorRef.current?.reset();
    setStats(null);
  };

  const progress = stats?.progress ?? 0;
  const ready = progress >= 1 && !(stats?.lastFrameStalled ?? false);

  return (
    <>
      <Header title="采集真随机数" subtitle="第 1 / 4 步" onBack={onCancel} />
      <div className="np-main" onPointerMove={recordTouch}>
        {!started ? (
          <>
            <h2 className="np-headline">用摄像头噪声生成私钥</h2>
            <div className="np-list">
              <div className="np-list__item np-list__item--static">
                <span className="np-grow">对准有光、有细节的地方</span>
              </div>
              <div className="np-list__item np-list__item--static">
                <span className="np-grow">保持 3–5 秒，轻微晃动更好</span>
              </div>
            </div>
            <Alert tone="warn" title="先开着飞行模式">
              这台设备不应该联网。系统层面它也没有联网权限。
            </Alert>
            {!cameraSupported() ? (
              <Alert tone="danger" title="摄像头不可用">
                当前环境不支持摄像头。请使用 Android 版 App，或在 https 下打开。
              </Alert>
            ) : null}
            <Button block disabled={!cameraSupported()} onClick={() => setStarted(true)}>
              开始采集
            </Button>
          </>
        ) : (
          <>
            <div className="np-camera">
              <video ref={videoRef} playsInline muted autoPlay />
              <div className="np-camera__overlay">
                <div className="np-scan-frame" />
              </div>
            </div>

            <div className="np-stack" style={{ gap: 8 }}>
              <div className="np-row np-row--between">
                <span className="np-label">已采集熵</span>
                <span className="np-badge np-badge--accent">
                  {(stats?.estimatedMinEntropyBits ?? 0).toFixed(0)} / {requiredBits} bit
                </span>
              </div>
              <ProgressBar value={progress} tone={ready ? 'up' : 'neutral'} />
            </div>

            <div className="np-grid-3">
              <div className="np-metric">
                <span className="np-metric__value">{stats?.frames ?? 0}</span>
                <span className="np-metric__label">帧</span>
              </div>
              <div className="np-metric">
                <span className="np-metric__value">{stats?.rawBits ?? 0}</span>
                <span className="np-metric__label">原始比特</span>
              </div>
              <div className="np-metric">
                <span className="np-metric__value">{((stats?.durationMs ?? 0) / 1000).toFixed(1)}s</span>
                <span className="np-metric__label">时长</span>
              </div>
            </div>

            {stats?.lastFrameStalled ? (
              <Alert tone="warn">画面看起来是静止的——对准有光的区域并轻微晃动。</Alert>
            ) : null}

            {stats && stats.frames > 8 && progress < 0.15 ? (
              <Alert tone="warn">熵积累很慢——对准更暗或有更多细节的区域。</Alert>
            ) : null}

            <div className="np-body np-body--tight np-center">轻微晃动手机会更快</div>
          </>
        )}
      </div>
      {started ? (
        <div className="np-footer">
          {error ? (
            <Alert tone="danger" title="无法生成助记词">
              {error}
            </Alert>
          ) : null}
          {error ? (
            <Button block variant="secondary" onClick={retry}>
              重新采集
            </Button>
          ) : (
            <>
              <Button block disabled={!ready || finishing} onClick={finish}>
                {finishing ? '正在生成助记词…' : ready ? '完成采集，生成助记词' : '继续采集…'}
              </Button>
              {!ready && stats ? (
                <div className="np-body np-body--tight np-center">
                  {collectorRef.current?.blockingReasons().join('；') ?? '正在准备…'}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
