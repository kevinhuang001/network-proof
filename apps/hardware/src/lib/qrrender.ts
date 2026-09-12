import QRCode from 'qrcode';
import { qr as qrTokens, qrLayout } from '@netproof/ui';

/**
 * Animated QR rendering.
 *
 * `qrcode` is used only for its encoder (`QRCode.create` gives us the module
 * matrix); painting is done here so we control module size, quiet zone and the
 * animation timing, and so the module matrices can be precomputed once instead of
 * being re-encoded on every animation frame.
 *
 * The palette is pure black on pure white. Adding brand colour to a QR code looks
 * nice and scans worse; on a phone screen held at arm's length, contrast is the
 * only thing that matters.
 */

export interface PreparedFrames {
  matrices: { modules: Uint8Array; size: number }[];
  moduleCount: number;
}

export function prepareFrames(texts: string[]): PreparedFrames {
  const matrices = texts.map((text) => {
    const created = QRCode.create(text, { errorCorrectionLevel: qrTokens.errorCorrectionLevel });
    return { modules: created.modules.data, size: created.modules.size };
  });
  const moduleCount = matrices.reduce((max, matrix) => Math.max(max, matrix.size), 0);
  return { matrices, moduleCount };
}

/** Paint one module matrix into a canvas, sized to fit. */
export function paintMatrix(
  canvas: HTMLCanvasElement,
  matrix: { modules: Uint8Array; size: number },
  moduleCount: number,
): void {
  const quiet = qrTokens.quietZoneModules;
  /*
   * The container's width, not the canvas's own: `canvas.clientWidth` is what this function
   * sets, so reading it back made every repaint depend on the previous one — and a code that
   * shrinks on each repaint is a code that eventually cannot be scanned.
   */
  const holder = canvas.parentElement;
  const style = holder ? window.getComputedStyle(holder) : null;
  const padding = style
    ? (Number.parseFloat(style.paddingLeft || '0') || 0) + (Number.parseFloat(style.paddingRight || '0') || 0)
    : 0;
  const available = holder ? Math.max(80, holder.clientWidth - padding) : 320;
  const { modulePx, pixels } = qrLayout(available, moduleCount, { quietZoneModules: quiet });
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

  // Centre the (possibly smaller) matrix inside the largest one so a code does
  // not jump around while the animation plays.
  const offset = quiet + Math.floor((moduleCount - matrix.size) / 2);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.modules[y * matrix.size + x]) continue;
      context.fillRect((offset + x) * modulePx, (offset + y) * modulePx, modulePx, modulePx);
    }
  }
}

export interface AnimatedQrOptions {
  canvas: HTMLCanvasElement;
  frameDurationMs?: number;
  onFrame?: (index: number, total: number) => void;
  /** Called after a full cycle, so the UI can nudge the user to keep scanning. */
  onCycle?: (cycle: number) => void;
}

export class AnimatedQr {
  private frames: PreparedFrames;
  private index = 0;
  private cycle = 0;
  private timer: number | null = null;
  private readonly options: AnimatedQrOptions;

  constructor(texts: string[], options: AnimatedQrOptions) {
    this.options = options;
    this.frames = prepareFrames(texts);
    this.paint();
  }

  get total(): number {
    return this.frames.matrices.length;
  }

  start(): void {
    this.stop();
    const duration = this.options.frameDurationMs ?? qrTokens.frameDurationMs;
    this.timer = window.setInterval(() => {
      this.index++;
      if (this.index >= this.frames.matrices.length) {
        this.index = 0;
        this.cycle++;
        this.options.onCycle?.(this.cycle);
      }
      this.paint();
    }, duration);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Re-paint at the current size, e.g. after a rotation. */
  repaint(): void {
    this.paint();
  }

  private paint(): void {
    const matrix = this.frames.matrices[this.index];
    if (!matrix) return;
    paintMatrix(this.options.canvas, matrix, this.frames.moduleCount);
    this.options.onFrame?.(this.index, this.frames.matrices.length);
  }
}

/** One-shot static QR, for a single-frame transfer. */
export function paintSingle(canvas: HTMLCanvasElement, text: string): void {
  const prepared = prepareFrames([text]);
  const matrix = prepared.matrices[0];
  if (matrix) paintMatrix(canvas, matrix, prepared.moduleCount);
}
