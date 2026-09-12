import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { autoFramesForMessage, buildSignRequestMessage } from '@netproof/core';
import { READABLE_MODULE_PX, estimateFinder, matchesFinderRatio, otsuThreshold, sizeAdvice } from '../src/lib/finderPattern';

/**
 * Measuring the code instead of guessing about it.
 *
 * The complaint this exists for is 「一直还没扫到」: whether a code is readable is decided by how
 * many camera pixels land on each module, and that is invisible to the person holding the phone.
 * These tests feed it synthetic camera frames — a real frame of a real transfer, at a known
 * number of pixels per module, blurred and noisy — and check that the estimate matches what was
 * drawn.
 */

const request = buildSignRequestMessage({
  t: 'req', id: '0x00', kind: 'tx', path: "m/44'/60'/0'/0/0",
  address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', chainId: 1, origin: 'https://app.example.org',
  tx: { type: 'eip1559', nonce: 1, to: null, value: '1', data: '0x', gas: '21000', maxFeePerGas: '1', maxPriorityFeePerGas: '1' },
});
const frame = autoFramesForMessage('NP-REQ', request, 300).frames[0]!;
const matrix = QRCode.create(frame, { errorCorrectionLevel: 'M' });
const n = matrix.modules.size;

/** The code as a camera sees it: `modulePx` pixels per module, on a dark page, blurred. */
function scene(modulePx: number, size = 600, blurSigma = 0.8) {
  const total = n + 8;
  const side = Math.round(total * modulePx);
  const gray = new Float32Array(size * size).fill(12);
  const ox = Math.round((size - side) / 2), oy = Math.round((size - side) / 2);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(x / modulePx) - 4, my = Math.floor(y / modulePx) - 4;
    const inside = mx >= 0 && my >= 0 && mx < n && my < n;
    const tx = ox + x, ty = oy + y;
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
    gray[ty * size + tx] = inside && matrix.modules.data[my * n + mx] ? 0 : 255;
  }
  // A little blur, so the runs are not perfectly square.
  const radius = 2;
  const k: number[] = [];
  for (let i = -radius; i <= radius; i++) k.push(Math.exp(-(i * i) / (2 * blurSigma * blurSigma)));
  const t = k.reduce((a, b) => a + b, 0);
  const w = k.map((v) => v / t);
  const h1 = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0;
    for (let i = -radius; i <= radius; i++) a += w[i + radius]! * gray[y * size + Math.min(size - 1, Math.max(0, x + i))]!;
    h1[y * size + x] = a;
  }
  const out = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0;
    for (let i = -radius; i <= radius; i++) a += w[i + radius]! * h1[Math.min(size - 1, Math.max(0, y + i)) * size + x]!;
    out[y * size + x] = Math.max(0, Math.min(255, a));
  }
  return { gray: out, size };
}

describe('the 1:1:3:1:1 ratio', () => {
  it('accepts a finder pattern and rejects ordinary code', () => {
    expect(matchesFinderRatio([1, 1, 3, 1, 1])).toBe(true);
    expect(matchesFinderRatio([3, 3, 9, 3, 3])).toBe(true);
    expect(matchesFinderRatio([2, 2, 6, 2, 2])).toBe(true);
    // Not the pattern: wrong proportions, too few runs, or nothing at all.
    expect(matchesFinderRatio([1, 1, 1, 1, 1])).toBe(false);
    expect(matchesFinderRatio([1, 1, 3, 1])).toBe(false);
    expect(matchesFinderRatio([1, 1, 8, 1, 1])).toBe(false);
    expect(matchesFinderRatio([])).toBe(false);
  });

  it('cuts a screen against a dark surround in the middle', () => {
    const gray = new Uint8Array([10, 12, 14, 240, 250, 245, 20, 18]);
    const threshold = otsuThreshold(gray);
    expect(threshold).toBeGreaterThanOrEqual(14);
    expect(threshold).toBeLessThan(240);
  });
});

describe('measuring what the camera is looking at', () => {
  it('reports the module size that was drawn', () => {
    for (const modulePx of [3, 4, 5, 6]) {
      const s = scene(modulePx);
      const estimate = estimateFinder(s.gray, s.size, s.size);
      expect(estimate, `${modulePx}px per module`).not.toBeNull();
      /*
       * Within 40% of the truth. Blur moves a run boundary by a pixel, which is a third of a
       * module at 3 px/module and a sixth at 6 — the estimate is allowed to be rough because
       * the decision it feeds ("closer" or "close enough") is coarse by nature.
       */
      expect(estimate!.modulePx).toBeGreaterThan(modulePx * 0.6);
      expect(estimate!.modulePx).toBeLessThan(modulePx * 1.4);
    }
  });

  it('classifies a distant code as too far, and a close one as close enough', () => {
    // The decision the whole file exists to make, tested at the two ends rather than in the
    // middle where the measurement is inherently fuzzy.
    const far = estimateFinder(scene(2).gray, 600, 600);
    expect(sizeAdvice(far)).toContain('拿近');
    const close = estimateFinder(scene(6).gray, 600, 600);
    expect(sizeAdvice(close)).toContain('调亮');
  });

  it('finds more than one pattern on a whole code', () => {
    const s = scene(5);
    const estimate = estimateFinder(s.gray, s.size, s.size);
    expect(estimate!.count).toBeGreaterThanOrEqual(2);
  });

  it('finds nothing in a picture with no code in it', () => {
    const flat = new Uint8ClampedArray(400 * 400).fill(200);
    expect(estimateFinder(flat, 400, 400)).toBeNull();
    const tiny = new Uint8ClampedArray(20 * 20).fill(0);
    expect(estimateFinder(tiny, 20, 20)).toBeNull();
  });
});

describe('what the user is told', () => {
  it('says which way to move, and says nothing without evidence', () => {
    expect(sizeAdvice(null)).toBeNull();
    const far = sizeAdvice({ count: 3, modulePx: READABLE_MODULE_PX - 1, at: { x: 0, y: 0 } });
    expect(far).toContain('拿近');
    const close = sizeAdvice({ count: 3, modulePx: READABLE_MODULE_PX + 2, at: { x: 0, y: 0 } });
    expect(close).toContain('调亮');
    // The threshold is the measured one: five pixels per module always reads, two never does,
    // and this is the line between "get closer" and "the problem is elsewhere".
    expect(READABLE_MODULE_PX).toBe(4);
  });
});
