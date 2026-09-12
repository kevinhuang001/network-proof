/**
 * How big the QR code in the viewfinder actually is.
 *
 * Written because of a complaint that could not be acted on: 「一直还没扫到」. Whether a code is
 * readable is decided almost entirely by how many camera pixels land on each module, and that
 * number is invisible to the person holding the phone — they have no way to tell "too far away"
 * from "too close and blown out" from "the lens is smeared". So the device measures it.
 *
 * Every QR code carries three finder patterns: the squares in three corners, each of which is a
 * run of dark/light/dark/light/dark in the ratio 1:1:3:1:1 across exactly seven modules. Finding
 * one gives both facts at once — where the code is, and how many pixels a module occupies —
 * without needing to know which version of QR code it is.
 *
 * This is a *diagnostic*, never a gate: a failure to find a finder pattern says nothing about
 * whether the decoder can read the code, so nothing here is allowed to prevent an attempt.
 */

export interface FinderEstimate {
  /** Finder patterns found. A complete code has three; one is enough to measure. */
  count: number;
  /** Module size in camera pixels, the smaller of the two axes. */
  modulePx: number;
  /** Centre of the best pattern found, in source pixels. */
  at: { x: number; y: number };
  /**
   * The code's own extent, padded: where to look when measuring how sharp it is, and where to
   * point the user when telling them what the camera can see.
   */
  region: { left: number; top: number; right: number; bottom: number };
}

/** 1:1:3:1:1 across seven modules. */
const RATIOS = [1, 1, 3, 1, 1];
const RATIO_TOTAL = 7;
/**
 * How far off a run may be and still count.
 *
 * Blur moves a boundary by a pixel or so, which is a bigger fraction of a small module than of a
 * large one, so the check is relative. It is deliberately not generous: at 0.6, a run of eight
 * where three were expected passed as "1:1:3:1:1", and a detector that believes that finds
 * finder patterns in ordinary screen content and then advises the user about the wrong thing.
 */
const TOLERANCE = 0.4;

/** Otsu's threshold: one global cut, which is enough for a screen against a dark surround. */
export function otsuThreshold(gray: Uint8Array | Uint8ClampedArray): number {
  const histogram = new Uint32Array(256);
  for (let index = 0; index < gray.length; index++) histogram[gray[index]!] += 1;
  const total = gray.length;
  let sum = 0;
  for (let level = 0; level < 256; level++) sum += level * histogram[level]!;

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level++) {
    weightBackground += histogram[level]!;
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += level * histogram[level]!;
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) * (meanBackground - meanForeground);
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  return best;
}

/** Does this run of five lengths look like 1:1:3:1:1? */
export function matchesFinderRatio(runs: number[]): boolean {
  if (runs.length !== 5) return false;
  const total = runs.reduce((sum, value) => sum + value, 0);
  if (total < RATIO_TOTAL) return false;
  const unit = total / RATIO_TOTAL;
  if (unit < 1) return false;
  return runs.every(
    (run, index) => Math.abs(run - RATIOS[index]! * unit) <= TOLERANCE * RATIOS[index]! * unit,
  );
}

interface Candidate {
  x: number;
  y: number;
  /** The horizontal 1:1:3:1:1 run total, in pixels. */
  total: number;
}

/**
 * The same measurement down a column, for a candidate found along a row.
 *
 * A finder pattern is a square ring: it is 1:1:3:1:1 horizontally *and* vertically, at the same
 * scale. Requiring both is what keeps a run of ordinary screen content — or two white modules
 * blurred into one — from being reported as a code, and it corrects the measurement when blur
 * has merged the light runs along one axis.
 *
 * Returns the vertical run total, or null when the column does not agree.
 */
function verticalTotal(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  threshold: number,
  window: number,
): number | null {
  const from = Math.max(0, Math.round(y - window));
  const to = Math.min(height - 1, Math.round(y + window));
  const runs: number[] = [];
  const starts: number[] = [];
  let dark = gray[from * width + x]! <= threshold;
  let start = from;
  const flush = (end: number): void => {
    runs.push(end - start);
    starts.push(start);
  };
  for (let row = from + 1; row <= to; row++) {
    const isDark = gray[row * width + x]! <= threshold;
    if (isDark !== dark) {
      flush(row);
      start = row;
      dark = isDark;
    }
  }
  flush(to + 1);

  // Slide a five-run window over the column and take the one containing the candidate.
  for (let index = 0; index + 5 <= runs.length; index++) {
    const slice = runs.slice(index, index + 5);
    if (!matchesFinderRatio(slice)) continue;
    const start0 = starts[index]!;
    const end = start0 + slice.reduce((sum, value) => sum + value, 0);
    if (y < start0 || y > end) continue;
    return slice.reduce((sum, value) => sum + value, 0);
  }
  return null;
}

/**
 * Find the code's module size, or nothing.
 *
 * Rows are scanned rather than every pixel, a horizontal match only counts when the rows below
 * it agree, and the pattern is then confirmed down a column. Three independent checks, because
 * the advice built on this number is worthless if the number is wrong.
 */
export function estimateFinder(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): FinderEstimate | null {
  if (width < 32 || height < 32) return null;
  const threshold = otsuThreshold(gray);
  const rowStep = Math.max(1, Math.round(height / 120));
  const candidates: Candidate[] = [];

  for (let y = 0; y < height; y += rowStep) {
    const runs: number[] = [];
    const starts: number[] = [];
    let dark = gray[y * width]! <= threshold;
    let runStart = 0;

    const flush = (end: number): void => {
      runs.push(end - runStart);
      starts.push(runStart);
      if (runs.length > 5) {
        runs.shift();
        starts.shift();
      }
      if (runs.length === 5 && matchesFinderRatio(runs)) {
        const total = runs.reduce((sum, value) => sum + value, 0);
        candidates.push({ x: starts[2]! + runs[2]! / 2, y, total });
      }
    };

    for (let x = 1; x < width; x++) {
      const isDark = gray[y * width + x]! <= threshold;
      if (isDark !== dark) {
        flush(x);
        runStart = x;
        dark = isDark;
      }
    }
  }

  if (candidates.length === 0) return null;

  const groups: Candidate[][] = [];
  for (const candidate of candidates) {
    const group = groups.find((entry) => {
      const last = entry[entry.length - 1]!;
      return (
        Math.abs(last.x - candidate.x) <= candidate.total / 2 &&
        Math.abs(last.y - candidate.y) <= rowStep * 3
      );
    });
    if (group) group.push(candidate);
    else groups.push([candidate]);
  }

  const estimates: {
    modulePx: number;
    at: { x: number; y: number };
    region: { left: number; top: number; right: number; bottom: number };
  }[] = [];
  for (const group of groups) {
    if (group.length < 2) continue; // one row is a coincidence
    const first = group[0]!;
    const vertical = verticalTotal(gray, width, height, Math.round(first.x), Math.round(first.y), threshold, first.total);
    if (vertical === null) continue;
    /*
     * The smaller of the two axes. Blur merges light runs, which *inflates* a measurement, and an
     * inflated module size is the dangerous direction: it turns "too far away" into "close
     * enough, look elsewhere for the problem".
     */
    /*
     * The extent of the patterns found, padded by a few modules. A finder pattern sits inside the
     * code, so the real code is a little larger than the box around the patterns — the pad covers
     * the pattern's own width and the quiet zone, which is all a sharpness reading needs.
     */
    const modulePx = Math.min(first.total, vertical) / RATIO_TOTAL;
    const pad = modulePx * 8;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const entry of group) {
      left = Math.min(left, entry.x);
      right = Math.max(right, entry.x);
      top = Math.min(top, entry.y);
      bottom = Math.max(bottom, entry.y);
    }
    estimates.push({
      modulePx,
      at: { x: first.x, y: first.y },
      region: {
        left: Math.max(0, Math.round(left - pad)),
        top: Math.max(0, Math.round(top - pad)),
        right: Math.min(width, Math.round(right + pad)),
        bottom: Math.min(height, Math.round(bottom + pad)),
      },
    });
  }

  if (estimates.length === 0) return null;
  estimates.sort((a, b) => a.modulePx - b.modulePx);
  const best = estimates[0]!;
  return { count: estimates.length, modulePx: best.modulePx, at: best.at, region: best.region };
}

/**
 * Below this many camera pixels per module, the advice is "closer".
 *
 * Measured against a simulated camera photographing another screen: at five pixels per module a
 * code reads every time, at three to four the same scene decodes in one run and fails in the
 * next, and at two it never decodes. Four sits in the middle of the band where moving closer
 * still helps, which is the only decision this number feeds.
 */
export const READABLE_MODULE_PX = 4;

/** What to tell the user about the size of the code in front of them. */
export function sizeAdvice(estimate: FinderEstimate | null): string | null {
  if (estimate === null) return null;
  if (estimate.modulePx < READABLE_MODULE_PX) return '二维码太远了：把手机拿近一点，让码占满方框';
  return '码的大小够了，但读不出来：擦一下镜头、把插件端屏幕调亮，拿稳别晃';
}
