import { describe, expect, it } from 'vitest';
import { cropForRegion } from '../src/lib/photoScan';

/**
 * Where to cut a photograph, given a region found in a reduced copy of it.
 *
 * This is the one piece of the photo path that can be held still by a test, and it is worth
 * holding: the arithmetic maps from a scaled copy back to the original pixels, and getting it
 * wrong means confidently decoding the wrong part of a 12-megapixel photograph — which is exactly
 * the class of mistake that produced 「实际拍到的只是预览框里的一角」.
 */
describe('mapping a located region back to the photograph', () => {
  const photo = { width: 4000, height: 3000 };

  it('scales the box back up and adds a margin around it', () => {
    // A 200×200 box in a copy scaled to a quarter of the original: 800×800 in the photograph.
    const crop = cropForRegion({ left: 400, top: 500, right: 600, bottom: 700 }, 0.25, photo);
    expect(crop.right - crop.left).toBeGreaterThanOrEqual(800);
    expect(crop.bottom - crop.top).toBeGreaterThanOrEqual(800);
    // Centred on the same place: the box was at 1600..2400 in the original.
    expect((crop.left + crop.right) / 2).toBeCloseTo(2000, -1);
    expect((crop.top + crop.bottom) / 2).toBeCloseTo(2400, -1);
  });

  it('never asks for pixels outside the photograph', () => {
    // A region touching the edge: the margin must be clipped, not wrapped or negative.
    const crop = cropForRegion({ left: 0, top: 0, right: 100, bottom: 100 }, 0.1, photo);
    expect(crop.left).toBe(0);
    expect(crop.top).toBe(0);
    expect(crop.right).toBeLessThanOrEqual(photo.width);
    expect(crop.bottom).toBeLessThanOrEqual(photo.height);

    const corner = cropForRegion({ left: 990, top: 740, right: 1000, bottom: 750 }, 0.1, photo);
    expect(corner.right).toBe(photo.width);
    expect(corner.bottom).toBe(photo.height);
  });

  it('is a no-op in scale when the copy was the original', () => {
    const crop = cropForRegion({ left: 100, top: 200, right: 300, bottom: 400 }, 1, photo);
    expect(crop.left).toBeLessThan(100);
    expect(crop.right).toBeGreaterThan(300);
    expect(crop.right - crop.left).toBeGreaterThanOrEqual(200);
  });
});
