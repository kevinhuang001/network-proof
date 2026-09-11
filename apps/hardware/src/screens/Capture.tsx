import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CameraNoiseCollector } from '@netproof/core';
import type { CollectorStats, EntropyBlocker, EntropyResult } from '@netproof/core';
import { Alert, Button, Header, ProgressBar, haptic } from '../components/primitives';
import { startEntropyCapture, cameraSupported, isAbortError } from '../lib/camera';
import type { CaptureHandle } from '../lib/camera';

/**
 * Turn a blocker into one short Chinese phrase.
 *
 * Terse on purpose: this sits under the progress bar and is read at a glance while the
 * user is holding the phone at arm's length. The amounts are rounded to the unit the
 * user cares about (bits, whole seconds) instead of echoing raw internal numbers.
 */
function blockerText(blocker: EntropyBlocker): string {
  switch (blocker.code) {
    case 'frames':
      return `还需 ${Math.max(0, blocker.need - blocker.have)} 帧`;
    case 'duration':
      return `还需 ${Math.max(0, (blocker.needMs - blocker.haveMs) / 1000).toFixed(1)} 秒`;
    case 'entropy':
      return `还需 ${Math.max(0, Math.ceil(blocker.needBits - blocker.haveBits))} bit 噪声`;
    case 'stalled':
      return '画面静止，轻轻晃一下';
  }
}

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
  const [blockers, setBlockers] = useState<EntropyBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    // StrictMode runs this effect twice in development, and leaving the screen while the
    // permission prompt is open cancels it for real. The controller makes both cases
    // release the camera, instead of leaving a stream running behind a screen that is no
    // longer showing it.
    const controller = new AbortController();
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
          signal: controller.signal,
          onFrame: ({ stats: next }) => {
            if (cancelled) return;
            setStats(next);
            // The button's enabled state and the hint are both derived from this one
            // list, so they can never disagree — a button that says "完成采集" while the
            // hint underneath explains why it cannot finish is what made this screen
            // look broken.
            setBlockers(collector.blockers());
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
        // An interrupted start is our own shutdown, not a camera failure.
        if (!cancelled && !isAbortError(caught)) setError((caught as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
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
    setBlockers([]);
  };

  const progress = stats?.progress ?? 0;
  // `finalize()` refuses on exactly these blockers, so readiness is defined by the same
  // list rather than by a second, hand-written condition that can drift out of step.
  const ready = stats !== null && blockers.length === 0;

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
              {/*
                The blocker hint lives here, not in the sticky footer, and in a slot with
                a fixed height. In the footer it sat directly above the action button and
                re-wrapped as its numbers changed, so the button moved up and down on
                every frame. Nothing about this text can move a control now.
              */}
              <div className="np-hint-slot">
                {ready ? '轻轻晃动手机会更快' : blockers.map(blockerText).join(' · ')}
              </div>
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

            {/*
              One warning, shown only after the capture has had long enough to prove the
              problem is real. The previous version fired at frame 9 and vanished again
              the moment progress passed 15%, so a slow start made it blink.
            */}
            {(stats?.durationMs ?? 0) > 2500 && progress < 0.15 ? (
              <Alert tone="warn">熵积累很慢——对准更暗或有更多细节的区域。</Alert>
            ) : null}
          </>
        )}
      </div>
      {/*
        The footer holds exactly one button, in every state, so its position is fixed.
        A failure swaps in a retry button and puts the reason *above* it, which grows the
        footer upward instead of pushing the button down.
      */}
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
            <Button block disabled={!ready || finishing} onClick={finish}>
              {finishing ? '正在生成助记词…' : ready ? '完成采集，生成助记词' : '继续采集…'}
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}
