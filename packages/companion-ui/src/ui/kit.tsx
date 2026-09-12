import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { qr as qrTokens } from '@netproof/ui';
import { TextField } from '@netproof/ui/text-field';
import { ChevronLeftIcon } from './icons';

/**
 * Presentational primitives and the camera/QR helpers, shared by every screen of
 * the web companion.
 */

/**
 * Screen header: back control on the left, title centred, optional action right.
 *
 * The back control is always the first thing in the top-left corner, because that is
 * where every phone user's thumb already goes.
 */
export function Header({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: ReactNode;
}): ReactNode {
  return (
    <header className="np-header">
      <div className="np-header__side">
        {onBack ? (
          <button
            type="button"
            className="np-icon-btn np-icon-btn--plain"
            onClick={onBack}
            aria-label="返回"
          >
            <ChevronLeftIcon size={22} />
          </button>
        ) : null}
      </div>
      <div className="np-grow np-center">
        <h1 className="np-header__title">{title}</h1>
        {subtitle ? (
          <div className="np-label" style={{ marginTop: 2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="np-header__side np-header__side--end">{action}</div>
    </header>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'up' | 'down' | 'warn' | 'accent' | 'inverse';
}): ReactNode {
  return <span className={`np-badge${tone === 'neutral' ? '' : ` np-badge--${tone}`}`}>{children}</span>;
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'up';
  title?: string;
  children?: ReactNode;
}): ReactNode {
  const icon = tone === 'danger' ? '⚠' : tone === 'warn' ? '!' : tone === 'up' ? '✓' : 'ℹ';
  return (
    <div className={`np-alert np-alert--${tone}`}>
      <span className="np-alert__icon" aria-hidden>
        {icon}
      </span>
      <div className="np-grow">
        {title ? <div style={{ fontWeight: 700, marginBottom: children ? 2 : 0 }}>{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  block,
  size,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'danger-soft' | 'up' | 'ghost';
  disabled?: boolean;
  block?: boolean;
  size?: 'small';
}): ReactNode {
  return (
    <button
      type="button"
      className={`np-btn np-btn--${variant}${block ? ' np-btn--block' : ''}${size === 'small' ? ' np-btn--small' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function KeyValue({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: 'up' | 'down' | 'warn';
}): ReactNode {
  return (
    <div className="np-keyvalue">
      <span className="np-keyvalue__key">{label}</span>
      <span className={`np-keyvalue__value${mono ? ' np-mono' : ''}${tone ? ` np-${tone}` : ''}`}>
        {value}
      </span>
    </div>
  );
}

export function Spinner(): ReactNode {
  return <div className="np-spinner" role="status" aria-label="处理中" />;
}

export function ProgressBar({ value, tone = 'neutral' }: { value: number; tone?: 'neutral' | 'up' }): ReactNode {
  const percent = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={`np-progress${tone === 'up' ? ' np-progress--up' : ''}`}>
      <div className="np-progress__bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function CopyButton({ value, label = '复制' }: { value: string; label?: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="np-chip"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? '已复制' : label}
    </button>
  );
}

/** Animated QR display for requests going out to the device. */
export function QrDisplay({
  frames,
  frameDurationMs,
  caption,
}: {
  frames: string[];
  frameDurationMs?: number;
  caption?: string;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    // Encode every frame once, up front: re-encoding during the animation would
    // make the code stutter, and a stuttering code is a code that will not scan.
    const prepared = frames.map((text) => {
      const created = QRCode.create(text, { errorCorrectionLevel: qrTokens.errorCorrectionLevel });
      return { modules: created.modules.data, size: created.modules.size };
    });
    const moduleCount = prepared.reduce((max, matrix) => Math.max(max, matrix.size), 0);

    const paint = (position: number): void => {
      const matrix = prepared[position % prepared.length];
      if (!matrix) return;
      const quiet = qrTokens.quietZoneModules;
      const total = moduleCount + quiet * 2;
      const cssWidth = canvas.clientWidth || 340;
      const modulePx = Math.max(1, Math.floor(cssWidth / total));
      const pixels = modulePx * total;
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(pixels * dpr);
      canvas.height = Math.round(pixels * dpr);
      canvas.style.width = `${pixels}px`;
      canvas.style.height = `${pixels}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, pixels, pixels);
      context.fillStyle = '#0B0B0F';
      const offset = quiet + Math.floor((moduleCount - matrix.size) / 2);
      for (let y = 0; y < matrix.size; y++) {
        for (let x = 0; x < matrix.size; x++) {
          if (!matrix.modules[y * matrix.size + x]) continue;
          context.fillRect((offset + x) * modulePx, (offset + y) * modulePx, modulePx, modulePx);
        }
      }
    };

    paint(0);
    if (prepared.length === 1) return;
    let position = 0;
    const timer = window.setInterval(() => {
      position++;
      setIndex(position % prepared.length);
      paint(position);
    }, frameDurationMs ?? qrTokens.frameDurationMs);
    return () => window.clearInterval(timer);
  }, [frames, frameDurationMs]);

  return (
    <div className="np-stack">
      <div className="np-qr-stage np-qr-stage--large">
        <canvas ref={canvasRef} aria-label="二维码" />
      </div>
      <div className="np-row np-row--between">
        <span className="np-qr-caption">{caption ?? '用离线设备扫描'}</span>
        {frames.length > 1 ? (
          <span className="np-badge">
            {index + 1}/{frames.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * How long a scan may fail before it starts trying harder.
 *
 * `dontInvert` is half the work of `attemptBoth` and is right for the dark-on-light codes
 * both apps display. If nothing at all has decoded after a few seconds, the cheap
 * assumption is what is failing — a reflective screen can invert a code's apparent
 * polarity — and "cannot scan it" is worse than a decode that costs twice as much.
 */
const ROBUST_DECODE_AFTER_MS = 4000;

/**
 * What the user is being asked to point the camera at, in their words.
 *
 * The protocol names — NP-XPUB, NP-REQ, NP-SIG — are for the wire. Showing them here told
 * the user to "aim at the NP-XPUB QR code", which is a name they have never seen anywhere
 * in either app: the device calls this button 「登录插件钱包」.
 */
const SCAN_HINT: Record<'NP-XPUB' | 'NP-SIG' | 'NP-REQ' | 'NP-ACK', string> = {
  'NP-XPUB': '登录',
  'NP-REQ': '签名请求',
  'NP-SIG': '签名结果',
  'NP-ACK': '确认',
};

export interface ScanState {
  decoded: number;
  rejected: number;
  solved: number;
  total: number;
  hint: string;
}

/**
 * Camera scanner.
 *
 * Uses jsQR rather than the native BarcodeDetector: the latter is unavailable in
 * desktop Chrome on most platforms, and this is exactly where the flow runs.
 */
export function useQrScanner(options: {
  active: boolean;
  expectedType: 'NP-XPUB' | 'NP-SIG' | 'NP-REQ' | 'NP-ACK';
  onText: (text: string) => ScanState;
}): { videoRef: React.RefObject<HTMLVideoElement | null>; state: ScanState; error: string | null } {
  const { active, expectedType, onText } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<ScanState>({
    decoded: 0,
    rejected: 0,
    solved: 0,
    total: 0,
    hint: '等待摄像头…',
  });
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef(onText);
  callbackRef.current = onText;

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let frameHandle = 0;
    let stopped = false;
    const openedAt = Date.now();
    let lastScanAt = 0;
    let lastText = '';
    let lastTextAt = 0;
    let decoded = 0;

    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 480;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    // No smoothing: interpolating neighbouring pixels blurs QR modules together.
    context.imageSmoothingEnabled = false;

    const tick = (now: number): void => {
      if (stopped) return;
      frameHandle = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!video || now - lastScanAt < 60) return;
      lastScanAt = now;
      const side = Math.min(video.videoWidth, video.videoHeight);
      if (side === 0) return;
      context.drawImage(
        video,
        (video.videoWidth - side) / 2,
        (video.videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        480,
        480,
      );
      const image = context.getImageData(0, 0, 480, 480);
      const robust = decoded === 0 && Date.now() - openedAt > ROBUST_DECODE_AFTER_MS;
      const result = jsQR(image.data, image.width, image.height, {
        inversionAttempts: robust ? 'attemptBoth' : 'dontInvert',
      });
      if (!result || result.data.length === 0) return;
      if (result.data === lastText && now - lastTextAt < 900) return;
      lastText = result.data;
      lastTextAt = now;
      decoded++;
      const progress = callbackRef.current(result.data);
      setState({ ...progress, decoded });
    };

    void (async () => {
      try {
        const opened = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        // React StrictMode runs this effect twice, and leaving the screen while the
        // permission prompt is open cancels it for real. Bail out *before* touching the
        // element, or the first attempt assigns its stream over the second attempt's and
        // leaves a camera running that nothing is reading from.
        if (stopped) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stream = opened;
        const video = videoRef.current;
        if (!video) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        video.srcObject = opened;
        video.muted = true;
        video.playsInline = true;
        try {
          await video.play();
        } catch (caught) {
          // Assigning srcObject again interrupts a pending play() with an AbortError.
          // That is what our own cancelled attempt looks like, not a camera failure —
          // and it was being reported to the user as "无法打开摄像头" on a working camera.
          if ((caught as { name?: string }).name !== 'AbortError') throw caught;
        }
        if (stopped || video.srcObject !== opened) return;
        // Starting is retryable, so a previous failure must not outlive it: the panel
        // used to keep showing "无法打开摄像头" over a working preview.
        setError(null);
        setState((previous) => ({ ...previous, hint: `请对准${SCAN_HINT[expectedType]}二维码` }));
        frameHandle = requestAnimationFrame(tick);
      } catch (caught) {
        if (stopped) return;
        const name = (caught as { name?: string }).name;
        setError(
          name === 'NotAllowedError'
            ? '摄像头权限被拒绝。请在浏览器地址栏允许摄像头访问（必须是 localhost 或 https）。'
            : `无法打开摄像头：${(caught as Error).message}`,
        );
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frameHandle);
      for (const track of stream?.getTracks() ?? []) track.stop();
      // Never clear a stream this attempt does not own: a newer mount may already be
      // showing one.
      if (videoRef.current && videoRef.current.srcObject === stream) videoRef.current.srcObject = null;
    };
  }, [active, expectedType]);

  return { videoRef, state, error };
}

export function CameraPanel({
  videoRef,
  hint,
  solved,
  total,
  error,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hint: string;
  solved: number;
  total: number;
  error: string | null;
}): ReactNode {
  return (
    <div className="np-stack">
      <div className="np-camera">
        <video ref={videoRef} playsInline muted autoPlay />
        <div className="np-camera__overlay">
          <div className="np-scan-frame" />
        </div>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {total > 0 ? (
        <div className="np-stack" style={{ gap: 6 }}>
          <div className="np-row np-row--between">
            <span className="np-body np-body--tight">接收进度</span>
            <span className="np-badge np-badge--accent">
              {solved}/{total}
            </span>
          </div>
          <ProgressBar value={total > 0 ? solved / total : 0} tone={solved >= total ? 'up' : 'neutral'} />
        </div>
      ) : null}
      <div className="np-body np-body--tight np-center">{hint}</div>
    </div>
  );
}

/**
 * Password field with a reveal toggle.
 *
 * Composing-safe like every other text field (`@netproof/ui/text-field`): a phone keyboard
 * composing characters into a controlled input corrupts them, and a passcode is exactly the
 * kind of string a user cannot check by eye afterwards.
 */
export function PasswordField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  id?: string;
}): ReactNode {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="np-row">
      <TextField
        {...(id !== undefined ? { id } : {})}
        className="np-input np-grow"
        type={reveal ? 'text' : 'password'}
        value={value}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(autoFocus ? { autoFocus } : {})}
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
      />
      <button
        type="button"
        className="np-icon-btn"
        onClick={() => setReveal((previous) => !previous)}
        aria-label={reveal ? '隐藏' : '显示'}
      >
        {reveal ? '🙈' : '👁'}
      </button>
    </div>
  );
}

export function Toast({ message }: { message: string | null }): ReactNode {
  if (!message) return null;
  return (
    <div className="np-toast" role="status">
      {message}
    </div>
  );
}

export function useToast(): { toast: string | null; show: (message: string) => void } {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return { toast, show: setToast };
}
