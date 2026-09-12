import { describe, expect, it } from 'vitest';
import { qrLayout } from '@netproof/ui';

/**
 * How big a QR code is painted.
 *
 * The bug this exists for: both renderers measured `canvas.clientWidth` — which is what painting
 * *sets* — and used it as the input for the next paint. Switching between a 61-module animated
 * code and a 105-module static one therefore shrank the code a notch on every switch, which a
 * user reported as 「点击换成动画越来越小了」.
 */
describe('laying out a QR code', () => {
  it('uses whole pixels per module, and never more than the space available', () => {
    const layout = qrLayout(396, 89);
    expect(layout.totalModules).toBe(97);
    expect(layout.modulePx).toBe(4);
    expect(layout.pixels).toBe(388);
    expect(layout.pixels).toBeLessThanOrEqual(396);
  });

  it('is a pure function of the space, not of the last code it drew', () => {
    // The same available width always gives the same answer, whatever was drawn before — which
    // is what the feedback loop broke, one notch per toggle.
    const dense = qrLayout(396, 89);
    const sparse = qrLayout(396, 53);
    expect(qrLayout(396, 89)).toEqual(dense);
    expect(qrLayout(396, 89)).toEqual(qrLayout(396, 89));
    // More modules means smaller modules, and neither ever overflows the space it was given.
    expect(dense.modulePx).toBeLessThan(sparse.modulePx);
    expect(dense.pixels).toBeLessThanOrEqual(396);
    expect(sparse.pixels).toBeLessThanOrEqual(396);
  });

  it('still gives a drawable code in a tiny space', () => {
    const tiny = qrLayout(40, 177);
    expect(tiny.modulePx).toBe(1);
    expect(tiny.pixels).toBe(185);
    // A zero or missing measurement falls back rather than producing a zero-pixel canvas.
    expect(qrLayout(0, 89).modulePx).toBeGreaterThan(1);
  });
});
