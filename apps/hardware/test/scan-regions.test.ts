import { describe, expect, it } from 'vitest';
import { planPhotoRegions } from '../src/lib/scanRegions';

describe('photo scanning fallback plan', () => {
  for (const size of [{ width: 4000, height: 3000 }, { width: 3000, height: 4000 }, { width: 640, height: 480 }, { width: 80, height: 1920 }]) {
    it(`covers the whole photo without out-of-bounds rectangles: ${size.width}x${size.height}`, () => {
      const regions = planPhotoRegions(size);
      expect(regions.length).toBe(5);
      for (const { left, top, width, height } of regions) {
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(left + width).toBeLessThanOrEqual(size.width);
        expect(top + height).toBeLessThanOrEqual(size.height);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
      }
      const samplePoints = [
        [0, 0], [size.width - 1, 0], [0, size.height - 1],
        [size.width - 1, size.height - 1], [size.width / 2, size.height / 2],
      ];
      for (const [x, y] of samplePoints) {
        expect(regions.some(r => x! >= r.left && x! < r.left + r.width && y! >= r.top && y! < r.top + r.height)).toBe(true);
      }
    });
  }
  it('rejects missing or malformed camera dimensions', () => {
    expect(planPhotoRegions({ width: 0, height: 320 })).toEqual([]);
    expect(planPhotoRegions({ width: Number.NaN, height: 320 })).toEqual([]);
  });
  it('deduplicates identical crops on tiny images', () => {
    expect(planPhotoRegions({ width: 32, height: 32 })).toHaveLength(1);
  });
});
