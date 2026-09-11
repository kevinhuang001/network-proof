import { describe, expect, it } from 'vitest';
import { CameraNoiseCollector } from '../src/entropy/collector';
import { debiasTemporally, extractTemporalNoise } from '../src/entropy/noise';
import { vonNeumannDebias } from '../src/util/bits';
import {
  correlatedFrames,
  degenerateFrames,
  deterministicPatternFrames,
  twoCodeJitterFrames,
} from './helpers/synthetic';

/**
 * Regression tests for the entropy pipeline on a *realistic* sensor.
 *
 * These exist because of a bug that shipped and made the product unusable: tapping
 * "finish capture" did nothing. Three separate defects combined:
 *
 *  1. Von Neumann debiasing paired adjacent bits in raster order — neighbouring
 *     *pixels*, which are spatially correlated — so it discarded most of the
 *     entropy. It now pairs each pixel with itself one frame earlier.
 *  2. The statistical battery was run on the raw debiased stream, which is
 *     correlated by construction, so `runs`, `blockFrequency`, `serialCorrelation`
 *     and `mcv` all failed at p = 0 on a healthy sensor and `finalize()` threw.
 *  3. The battery's sample grew with capture length, and a fixed-alpha test rejects
 *     as n grows — so capturing *longer* made refusal *more* likely.
 *
 * Each is pinned by a test below.
 */

const REAL_SETTINGS = { requiredBits: 256, minFrames: 24, minDurationMs: 0 } as const;

function collect(frames: ReturnType<typeof correlatedFrames>, requiredBits = 256) {
  const collector = new CameraNoiseCollector({ ...REAL_SETTINGS, requiredBits });
  for (const frame of frames) collector.addFrame(frame);
  return collector;
}

describe('entropy extraction on a realistic sensor', () => {
  it('recovers far more entropy by pairing across time than across space', () => {
    // Defect 1. Adjacent pixels share row/column offsets and PRNU, so a von Neumann
    // pair drawn from neighbours is almost always equal and gets discarded.
    const frames = correlatedFrames({ frameCount: 12, width: 128, height: 128 });
    let raster = 0;
    let temporal = 0;
    let previous = extractTemporalNoise(frames[0]!, frames[1]!, { maxFrameDelta: 48 });
    for (let i = 2; i < frames.length; i++) {
      const current = extractTemporalNoise(frames[i - 1]!, frames[i]!, { maxFrameDelta: 48 });

      // The old behaviour: compact the contributing bits and pair adjacent entries.
      const compact = new Uint8Array(current.pixelsConsidered);
      let index = 0;
      for (let p = 0; p < current.contributing.length; p++) {
        if (current.contributing[p]) compact[index++] = current.plane[p]!;
      }
      raster += vonNeumannDebias(compact).bits.length;

      temporal += debiasTemporally(
        previous.plane,
        previous.contributing,
        current.plane,
        current.contributing,
      ).bits.length;
      previous = current;
    }
    expect(temporal).toBeGreaterThan(raster * 1.5);
  });

  it('completes a capture across the whole realistic parameter range', () => {
    // Defect 2. Every one of these used to throw ENTROPY_HEALTH_FAILED.
    const cases: [string, ReturnType<typeof correlatedFrames>, number][] = [
      // Frame size is kept modest here because generating the synthetic pixels in
      // JS costs far more than the extractor does. The realistic range is covered
      // by the small/large entries and by the dedicated long-capture tests below.
      ['minimum capture', correlatedFrames({ frameCount: 24, width: 96, height: 96, seed: 'a' }), 256],
      ['typical capture', correlatedFrames({ frameCount: 40, width: 128, height: 128, seed: 'b' }), 256],
      ['long capture', correlatedFrames({ frameCount: 300, width: 128, height: 128, seed: 'c' }), 256],
      ['very long capture', correlatedFrames({ frameCount: 600, width: 96, height: 96, seed: 'd' }), 256],
      ['low noise', correlatedFrames({ frameCount: 40, width: 128, height: 128, sigma: 1, seed: 'e' }), 256],
      ['very low noise', correlatedFrames({ frameCount: 40, width: 128, height: 128, sigma: 0.5, seed: 'f' }), 256],
      ['high noise', correlatedFrames({ frameCount: 40, width: 128, height: 128, sigma: 8, seed: 'g' }), 256],
      ['heavy banding', correlatedFrames({ frameCount: 40, width: 128, height: 128, banding: 6, columnNoise: 3, seed: 'h' }), 256],
      ['small frames', correlatedFrames({ frameCount: 40, width: 64, height: 64, seed: 'i' }), 256],
      ['large frames', correlatedFrames({ frameCount: 40, width: 256, height: 256, seed: 'j' }), 256],
      ['12-word seed', correlatedFrames({ frameCount: 40, width: 128, height: 128, seed: 'k' }), 128],
    ];
    for (const [label, frames, requiredBits] of cases) {
      const collector = collect(frames, requiredBits);
      const result = collector.finalize();
      expect(result.bytes.length, label).toBe(requiredBits / 8);
      expect(result.estimatedMinEntropyBits, label).toBeGreaterThanOrEqual(requiredBits);
      expect(result.health.filter((check) => !check.passed).map((c) => c.name), label).toEqual([]);
    }
  });

  it('does not refuse a capture just for being long', () => {
    // Defect 3. With a growing sample and a fixed alpha, the verdict drifted: the
    // same sensor passed at 40 frames and failed at 300. The sample is now fixed in
    // size, so the verdict is stable.
    for (const frameCount of [24, 40, 120, 300, 600]) {
      const collector = collect(
        correlatedFrames({ frameCount, width: 96, height: 96, seed: `len-${frameCount}` }),
      );
      const result = collector.finalize();
      const runs = result.health.find((check) => check.name === 'runs');
      expect(runs?.passed, `${frameCount} frames`).toBe(true);
      expect(result.health.every((check) => check.passed), `${frameCount} frames`).toBe(true);
    }
  });

  it('stays fast on a long capture', () => {
    // The battery used to unpack the entire debiased stream (millions of bits).
    const collector = collect(correlatedFrames({ frameCount: 600, width: 96, height: 96, seed: 'perf' }));
    const started = Date.now();
    collector.finalize();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('still refuses a source with no entropy at all', () => {
    const frozen = new CameraNoiseCollector({ requiredBits: 256, minFrames: 3, minDurationMs: 0 });
    for (const frame of degenerateFrames(10, 4096)) frozen.addFrame(frame);
    expect(() => frozen.finalize()).toThrowError(/camera entropy/);
  });

  it('refuses a source that varies but is not random', () => {
    // Deterministic alternation gives the extractor plenty of *variation* and no
    // unpredictability. This is the case the statistical battery exists to catch.
    const patterned = new CameraNoiseCollector({ requiredBits: 128, minFrames: 3, minDurationMs: 0 });
    for (const frame of deterministicPatternFrames(20)) patterned.addFrame(frame);
    expect(() => patterned.finalize()).toThrow();
  });

  it('keeps its entropy claim conservative for a quantization-limited sensor', () => {
    // Two-code jitter is genuinely random, so a wallet may legitimately be created —
    // but the measured bias must shrink the claim, not be ignored.
    const jitter = new CameraNoiseCollector({ requiredBits: 128, minFrames: 3, minDurationMs: 0 });
    for (const frame of twoCodeJitterFrames(20)) jitter.addFrame(frame);
    let credited: number;
    try {
      credited = jitter.finalize().estimatedMinEntropyBits;
    } catch {
      return; // refusing is also acceptable; over-claiming is not
    }
    const rawBits = jitter.stats().rawBits;
    // The 0.05 independence discount plus the measured bias must leave the claim far
    // below the number of bits that were actually extracted.
    expect(credited).toBeLessThan(rawBits * 0.05);
    expect(credited).toBeLessThan(20_000);
  });

  it('reports the advisory checks instead of hiding them', () => {
    const collector = collect(correlatedFrames({ frameCount: 40, width: 128, height: 128, seed: 'advisory' }));
    const result = collector.finalize();
    const names = result.health.map((check) => check.name);
    expect(names).toContain('serialCorrelation');
    // Every check carries an explanation the diagnostics screen can show verbatim.
    for (const check of result.health) {
      expect(check.detail.length).toBeGreaterThan(8);
      expect(check.threshold).toBeGreaterThan(0);
    }
  });

  it('is a pure function of the frames when the host CSPRNG is disabled', () => {
    const frames = correlatedFrames({ frameCount: 30, width: 128, height: 128, seed: 'det' });
    const run = (includeDeviceCsprng: boolean) => {
      const collector = new CameraNoiseCollector({
        ...REAL_SETTINGS,
        includeDeviceCsprng,
      });
      for (const frame of frames) collector.addFrame(frame);
      return Buffer.from(collector.finalize().bytes).toString('hex');
    };
    expect(run(false)).toBe(run(false));
    // With the host CSPRNG mixed in, two identical captures must NOT agree: the
    // mixing is real, not decorative. It earns no entropy credit either way.
    expect(run(true)).not.toBe(run(true));
  });
});
