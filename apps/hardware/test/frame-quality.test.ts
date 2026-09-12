import { describe, expect, it } from 'vitest';
import { SHARP_ENOUGH, classifyQuality, frameQuality, sharpness } from '../src/lib/frameQuality';

/**
 * The pixel-level checks that turn 「一直没反应」 into one of three named problems.
 *
 * A flat frame, a dark frame and a frozen frame all produce exactly the same silence from the
 * decoder, so these are the only things that can tell them apart.
 */

/** A frame of one colour, as RGBA. */
function flat(luma: number, size = 40): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = luma;
    data[index + 1] = luma;
    data[index + 2] = luma;
    data[index + 3] = 255;
  }
  return data;
}

/** A frame with real contrast, whose pattern shifts with the seed. */
function textured(seed = 0): Uint8ClampedArray {
  const data = new Uint8ClampedArray(40 * 40 * 4);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel++) {
    const on = (pixel * 37 + seed * 13) % 5 === 0;
    const value = on ? 250 : 6;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return data;
}

describe('reading a frame', () => {
  it('measures brightness and spread', () => {
    expect(frameQuality(flat(0)).luma).toBeLessThan(1);
    expect(frameQuality(flat(255)).luma).toBeGreaterThan(254);
    const picture = frameQuality(textured());
    expect(picture.luma).toBeGreaterThan(20);
    expect(picture.spread).toBeGreaterThan(200);
    expect(frameQuality(new Uint8ClampedArray(0))).toEqual({ luma: 0, signature: 0, spread: 0 });
  });

  it('gives different pictures different signatures, and the same picture the same one', () => {
    expect(frameQuality(textured(0)).signature).toBe(frameQuality(textured(0)).signature);
    expect(frameQuality(textured(0)).signature).not.toBe(frameQuality(textured(9)).signature);
  });
});

describe('classifying what we have seen', () => {
  it('says nothing about a normal picture', () => {
    const history = Array.from({ length: 20 }, (_, index) => frameQuality(textured(index)));
    expect(classifyQuality(history)).toBe('ok');
    expect(classifyQuality([])).toBe('ok');
  });

  it('calls a covered lens dark, but not after a single dark frame', () => {
    const dark = Array.from({ length: 12 }, () => frameQuality(flat(4)));
    expect(classifyQuality(dark)).toBe('dark');
    // One dark frame while the user moves the phone is not a covered lens.
    const mostlyFine = [...Array.from({ length: 11 }, (_, i) => frameQuality(textured(i))), frameQuality(flat(2))];
    expect(classifyQuality(mostlyFine)).toBe('ok');
  });

  it('calls a flat, blown-out picture blank', () => {
    expect(classifyQuality(Array.from({ length: 12 }, () => frameQuality(flat(252))))).toBe('blank');
    // A grey but perfectly flat frame has no contrast to find a code in either.
    const grey = frameQuality(flat(128));
    expect(grey.luma).toBeGreaterThan(100);
    expect(grey.spread).toBeLessThan(24);
    expect(classifyQuality(Array.from({ length: 12 }, () => grey))).toBe('blank');
  });

  it('calls a preview that stopped updating frozen', () => {
    // Identical frames: on a real camera, sensor noise means this never happens.
    const still = frameQuality(textured(0));
    expect(classifyQuality(Array.from({ length: 12 }, () => still))).toBe('frozen');
    // A live camera always differs a little, even pointed at a static scene.
    const live = Array.from({ length: 12 }, (_, index) => frameQuality(textured(index)));
    expect(classifyQuality(live)).toBe('ok');
  });
});

describe('how sharp the picture is', () => {
  /** A checkerboard of `modulePx`-wide squares: a code-like picture at a known softness. */
  function checker(modulePx: number, size = 240): Uint8Array {
    const gray = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        gray[y * size + x] = Math.floor(x / modulePx) % 2 === Math.floor(y / modulePx) % 2 ? 0 : 255;
      }
    }
    return gray;
  }

  /** A box blur, standing in for a lens that is not focused. */
  function soften(gray: Uint8Array, size: number, radius: number): Uint8Array {
    const out = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const sy = Math.min(size - 1, Math.max(0, y + dy));
            const sx = Math.min(size - 1, Math.max(0, x + dx));
            sum += gray[sy * size + sx]!;
            count += 1;
          }
        }
        out[y * size + x] = sum / count;
      }
    }
    return out;
  }

  it('separates a sharp picture from a smeared one', () => {
    const size = 240;
    const sharp = sharpness(checker(8, size), size, size);
    const smeared = sharpness(soften(checker(8, size), size, 5), size, size);
    expect(sharp).toBeGreaterThan(SHARP_ENOUGH * 2);
    expect(smeared).toBeLessThan(SHARP_ENOUGH);
    // A flat picture has nothing to focus on and must not read as "sharp".
    expect(sharpness(new Uint8Array(size * size).fill(128), size, size)).toBe(0);
    expect(sharpness(new Uint8Array(0), 0, 0)).toBe(0);
  });
});
