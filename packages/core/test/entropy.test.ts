import { describe, expect, it } from 'vitest';
import { NetProofError } from '../src/errors';
import { extractTemporalNoise, toGrayscale } from '../src/entropy/noise';
import {
  blockFrequencyTest,
  mcvHealthCheck,
  monobitTest,
  runHealthTests,
  runsTest,
  serialCorrelationTest,
} from '../src/entropy/health';
import { CameraNoiseCollector } from '../src/entropy/collector';
import { TestDrbg, degenerateFrames, interactionSamples, syntheticFrames } from './helpers/synthetic';

const unhex = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

describe('extractTemporalNoise', () => {
  it('produces an unbiased bit stream from symmetric sensor noise', () => {
    const frames = syntheticFrames({ frameCount: 2, sigma: 3, width: 128, height: 128 });
    const extracted = extractTemporalNoise(frames[0], frames[1]);
    // With sigma = 3 gray levels, roughly 70% of pixel pairs differ by 2+ codes;
    // the rest collapse onto the same integer value and are dropped rather than
    // being turned into invented bits.
    expect(extracted.pixelsConsidered).toBeGreaterThan(128 * 128 * 0.5);
    expect(extracted.onesFraction).toBeGreaterThan(0.45);
    expect(extracted.onesFraction).toBeLessThan(0.55);
  });

  it('extracts nothing from a pair of frames when the sensor is quantization limited', () => {
    // sigma = 0.3 gray levels: essentially every pixel pair rounds to the same
    // integer, so there is no sign information to harvest from a single pair.
    const frames = syntheticFrames({ frameCount: 2, sigma: 0.3, width: 64, height: 64 });
    const extracted = extractTemporalNoise(frames[0], frames[1]);
    expect(extracted.pixelsConsidered).toBeLessThan(64 * 64 * 0.05);
  });

  it('drops pixels whose delta looks like scene motion rather than noise', () => {
    const frames = syntheticFrames({
      frameCount: 2,
      sigma: 3,
      width: 64,
      height: 64,
      motionFraction: 0.25,
    });
    const extracted = extractTemporalNoise(frames[0], frames[1]);
    // The moving quarter of the frame is either rejected as too large or, when
    // it lands exactly on the median, contributes nothing — but it must never
    // turn into a stable biased bit.
    expect(extracted.pixelsRejected).toBeGreaterThan(0);
    expect(extracted.pixelsConsidered).toBeLessThan(64 * 64);
  });

  it('centers out a global illumination drift', () => {
    // Every pixel drifts by the same amount, so without centering the sign bit
    // would be a constant 1. The median removes the drift and leaves the noise.
    const frames = syntheticFrames({ frameCount: 2, sigma: 5, drift: 12, width: 96, height: 96 });
    const extracted = extractTemporalNoise(frames[0], frames[1]);
    expect(Math.abs(extracted.meanCenteredDelta)).toBeLessThan(1);
    expect(extracted.onesFraction).toBeGreaterThan(0.4);
    expect(extracted.onesFraction).toBeLessThan(0.6);
  });

  it('marks a frozen pair as carrying no information', () => {
    const frames = degenerateFrames(2, 4096);
    const extracted = extractTemporalNoise(frames[0], frames[1]);
    expect(extracted.pixelsConsidered).toBe(0);
    expect(extracted.pixelsRejected).toBe(4096);
  });

  it('rejects mismatched frame sizes', () => {
    const a = syntheticFrames({ frameCount: 1, width: 8, height: 8 })[0];
    const b = syntheticFrames({ frameCount: 1, width: 16, height: 16 })[0];
    expect(() => extractTemporalNoise(a, b)).toThrow(NetProofError);
  });

  it('follows the configurable delta threshold', () => {
    const frames = syntheticFrames({ frameCount: 2, sigma: 6, width: 64, height: 64 });
    const loose = extractTemporalNoise(frames[0], frames[1], { maxFrameDelta: 255 });
    const tight = extractTemporalNoise(frames[0], frames[1], { maxFrameDelta: 2 });
    expect(loose.pixelsConsidered).toBeGreaterThan(tight.pixelsConsidered);
  });
});

describe('toGrayscale', () => {
  it('applies Rec. 601 luma weights over RGBA', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const frame = toGrayscale(rgba, 4, 1, 4);
    // Integer truncation of the Rec. 601 weights (77/150/29 over 256).
    expect(Array.from(frame.data)).toEqual([76, 149, 28, 255]);
    expect(frame.width).toBe(4);
    expect(frame.height).toBe(1);
  });
});

describe('health tests', () => {
  const uniform = (n: number, seed = 'uniform'): number[] => {
    const drbg = new TestDrbg(seed);
    return Array.from({ length: n }, () => drbg.int(2));
  };

  it('accepts a balanced random stream', () => {
    // 200k bits = 25k bytes, enough for the SP 800-90B chi-square uniformity
    // test to be meaningful (>= 5 expected samples per byte value).
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      const bits = uniform(200000, `balanced-${name}`);
      for (const check of runHealthTests(bits, pack(bits))) {
        expect(check.passed, `${name}/${check.name}: ${check.detail}`).toBe(true);
      }
    }
  });

  it('flags a constant stream', () => {
    const bits = new Array(10000).fill(1);
    expect(monobitTest(bits).passed).toBe(false);
    expect(runsTest(bits).passed).toBe(false);
    expect(serialCorrelationTest(bits).passed).toBe(false);
  });

  it('flags a strongly biased stream with the monobit test', () => {
    const drbg = new TestDrbg('biased');
    const bits = Array.from({ length: 20000 }, () => (drbg.float() < 0.6 ? 1 : 0));
    const check = monobitTest(bits);
    expect(check.passed).toBe(false);
    expect(check.pValue).toBeLessThan(0.01);
  });

  it('flags an alternating stream as too regular', () => {
    const bits = Array.from({ length: 10000 }, (_, i) => i % 2);
    expect(runsTest(bits).passed).toBe(false);
    expect(serialCorrelationTest(bits).passed).toBe(false);
  });

  it('flags a periodic block structure that passes the global frequency test', () => {
    // Blocks alternate all-ones / all-zeros, so the global ones fraction is
    // exactly 1/2 and monobit passes, while every block is maximally non-random.
    const block = new Array(128).fill(1).concat(new Array(128).fill(0));
    const bits = Array.from({ length: 256 * 32 }, (_, i) => block[i % 256]);
    expect(monobitTest(bits).passed).toBe(true);
    expect(blockFrequencyTest(bits).passed).toBe(false);
    expect(serialCorrelationTest(bits).passed).toBe(false);
  });

  it('does not flag a block-balanced periodic stream with the block test', () => {
    // Control for the test above: an identical repeated block that happens to be
    // balanced *does* pass the block frequency test, which is the documented
    // limitation of that test rather than a bug.
    const block = new Array(64).fill(1).concat(new Array(64).fill(0));
    const bits = Array.from({ length: 128 * 64 }, (_, i) => block[i % 128]);
    expect(blockFrequencyTest(bits).passed).toBe(true);
  });

  it('is honest about its preconditions', () => {
    expect(monobitTest([]).passed).toBe(false);
    expect(runsTest([1, 0, 1, 0]).passed).toBe(false);
    expect(blockFrequencyTest(uniform(64), 128).passed).toBe(false);
    expect(mcvHealthCheck(new Uint8Array(4)).passed).toBe(false);
    expect(serialCorrelationTest([1, 1, 1, 1]).passed).toBe(false);
  });

  it('accepts uniform bytes and rejects a single-valued byte stream', () => {
    expect(mcvHealthCheck(new TestDrbg('bytes').bytes(8192)).passed).toBe(true);
    expect(mcvHealthCheck(new Uint8Array(8192).fill(0x42)).passed).toBe(false);
  });

  it('falls back to a min-entropy floor on samples too small for a uniformity test', () => {
    // 512 bytes = 2 expected samples per bucket: a chi-square test would be noise,
    // so the check must say so instead of reporting a bogus p-value.
    const check = mcvHealthCheck(new TestDrbg('small').bytes(512));
    expect(check.passed).toBe(true);
    expect(check.detail).toMatch(/uniformity test inconclusive/);
    const dominated = new Uint8Array(512);
    for (let i = 0; i < dominated.length; i++) dominated[i] = i < 0.5 * dominated.length ? 7 : i & 0xff;
    expect(mcvHealthCheck(dominated).passed).toBe(false);
  });

  it('reports the p-value threshold it used', () => {
    const check = monobitTest(uniform(1000), 0.001);
    expect(check.threshold).toBe(0.001);
  });
});

describe('CameraNoiseCollector', () => {
  const capture = (overrides: Partial<Parameters<typeof syntheticFrames>[0]> = {}) =>
    syntheticFrames({
      frameCount: 40,
      width: 96,
      height: 96,
      sigma: 3,
      frameIntervalMs: 33,
      ...overrides,
    });

  it('derives a full-strength seed from camera noise alone, deterministically', () => {
    const frames = capture();
    const run = () => {
      const collector = new CameraNoiseCollector({
        requiredBits: 256,
        minFrames: 8,
        minDurationMs: 300,
        includeDeviceCsprng: false,
      });
      for (const frame of frames) collector.addFrame(frame);
      return collector.finalize();
    };
    const first = run();
    const second = run();

    expect(first.bytes.length).toBe(32);
    expect(first.estimatedMinEntropyBits).toBeGreaterThanOrEqual(256);
    expect(first.healthy).toBe(true);
    expect(first.health.every((c) => c.passed)).toBe(true);
    // With the device CSPRNG excluded the pipeline is a pure function of the frames.
    expect(Buffer.from(first.bytes).toString('hex')).toBe(Buffer.from(second.bytes).toString('hex'));
    expect(first.transcriptDigest).toBe(second.transcriptDigest);
  });

  it('changes completely when a single frame changes', () => {
    const frames = capture();
    const tweaked = capture({ seed: 'a-different-capture' });
    const collect = (input: ReturnType<typeof capture>) => {
      const collector = new CameraNoiseCollector({
        minFrames: 1,
        minDurationMs: 0,
        includeDeviceCsprng: false,
      });
      for (const frame of input) collector.addFrame(frame);
      return collector.finalize();
    };
    const a = collect(frames);
    const b = collect(tweaked);
    expect(Buffer.from(a.bytes).toString('hex')).not.toBe(Buffer.from(b.bytes).toString('hex'));
  });

  it('mixes the host CSPRNG in when asked, without claiming credit for it', () => {
    const frames = capture();
    const collect = (includeDeviceCsprng: boolean) => {
      const collector = new CameraNoiseCollector({
        minFrames: 1,
        minDurationMs: 0,
        includeDeviceCsprng,
      });
      for (const frame of frames) collector.addFrame(frame);
      return collector.finalize();
    };
    const a = collect(true);
    const b = collect(true);
    expect(Buffer.from(a.bytes).toString('hex')).not.toBe(Buffer.from(b.bytes).toString('hex'));
    const csprng = b.sources.find((s) => s.name === 'device-csprng');
    expect(csprng?.estimatedMinEntropyBits).toBe(0);
    expect(csprng?.rawBits).toBe(256);
  });

  it('refuses to create a wallet when the camera is covered', () => {
    const collector = new CameraNoiseCollector({ minFrames: 3, minDurationMs: 0 });
    for (const frame of degenerateFrames(10, 4096)) collector.addFrame(frame);
    expect(collector.stats().lastFrameStalled).toBe(true);
    expect(() => collector.finalize()).toThrowError(/frozen or covered/);
    try {
      collector.finalize();
    } catch (error) {
      expect((error as NetProofError).code).toBe('ENTROPY_INSUFFICIENT');
    }
  });

  it('does not flicker the stall verdict on a sensor that is merely uneven', () => {
    // A real symptom, not a hypothetical. The verdict is derived per frame, and a frame
    // can legitimately earn no *marginal* credit — a repeated frame from a camera that
    // delivers 30fps into a 60Hz sampling loop, or runs that debiasing discards. The
    // capture screen consumed this flag for both its hint and its finish button, so an
    // uneven sensor made the button jump several times a second under the user's thumb.
    const healthy = capture({ frameCount: 30 });
    const dead = degenerateFrames(6, 96 * 96);
    // Interleaved so that the raw signal fires repeatedly but never sustains.
    const sequence = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((i) => [
      healthy[i]!,
      dead[0]!,
      healthy[i + 1]!,
      dead[1]!,
      dead[2]!,
      healthy[i + 2]!,
    ]);

    const collector = new CameraNoiseCollector({ minFrames: 3, minDurationMs: 0 });
    let streak = 0;
    let longest = 0;
    let fired = 0;
    for (const frame of sequence) {
      const raw = collector.addFrame(frame).stalled;
      streak = raw ? streak + 1 : 0;
      if (raw) fired += 1;
      longest = Math.max(longest, streak);
      expect(collector.stats().lastFrameStalled).toBe(false);
    }

    // Guard against the test quietly becoming vacuous if the synthetic data changes: the
    // per-frame signal must really be flickering while never reaching the verdict.
    expect(fired, 'the raw per-frame signal must fire').toBeGreaterThan(0);
    expect(longest, 'and must never sustain long enough to be a verdict').toBeLessThan(3);
  });

  it('still declares a genuinely frozen sensor dead, after the debounce', () => {
    const collector = new CameraNoiseCollector({ minFrames: 2, minDurationMs: 0 });
    const frozen = degenerateFrames(2, 1024)[0]!;
    collector.addFrame(frozen);
    // One frame is not yet evidence; the verdict needs frames to agree.
    expect(collector.stats().lastFrameStalled).toBe(false);
    for (let i = 0; i < 3; i++) collector.addFrame(frozen);
    expect(collector.stats().lastFrameStalled).toBe(true);
  });

  it('reports blockers as data, not only as prose', () => {
    // A UI cannot render the prose: it embeds live counters (so it re-wraps every
    // frame) and it is English. Structure lets the screen localise and shorten it.
    const collector = new CameraNoiseCollector({ requiredBits: 4096, minFrames: 20, minDurationMs: 0 });
    for (const frame of capture({ frameCount: 5 })) collector.addFrame(frame);

    const blockers = collector.blockers();
    expect(blockers).toContainEqual({ code: 'frames', have: 5, need: 20 });
    expect(blockers.map((b) => b.code)).toContain('entropy');
    expect(blockers.map((b) => b.code)).not.toContain('duration');

    // The prose stays for error messages, and stays in step with the data.
    expect(collector.blockingReasons()).toHaveLength(blockers.length);
    expect(collector.blockingReasons().join(' ')).toMatch(/at least 20 frames/);
  });

  it('refuses to create a wallet from too few frames', () => {
    const collector = new CameraNoiseCollector({ minFrames: 20, minDurationMs: 0 });
    for (const frame of capture({ frameCount: 5 })) collector.addFrame(frame);
    expect(() => collector.finalize()).toThrowError(/at least 20 frames/);
  });

  it('refuses to create a wallet from a too-short capture', () => {
    const collector = new CameraNoiseCollector({ minFrames: 2, minDurationMs: 5000 });
    for (const frame of capture({ frameCount: 10 })) collector.addFrame(frame);
    expect(() => collector.finalize()).toThrowError(/must last at least 5000ms/);
  });

  it('reports live progress for the capture screen', () => {
    const collector = new CameraNoiseCollector({ requiredBits: 256, minFrames: 10, minDurationMs: 0 });
    const frames = capture({ frameCount: 6 });
    for (const frame of frames) collector.addFrame(frame);

    const early = collector.stats();
    expect(early.frames).toBe(6);
    expect(early.durationMs).toBe(5 * 33);
    expect(early.rawBits).toBeGreaterThan(0);
    expect(early.progress).toBeGreaterThan(0);
    expect(collector.blockingReasons().join(' ')).toMatch(/at least 10 frames/);

    for (const frame of capture({ frameCount: 40 })) collector.addFrame(frame);
    expect(collector.stats().progress).toBe(1);
    expect(collector.blockingReasons()).toEqual([]);
  });

  it('cannot extract anything from fewer than three frames', () => {
    // Debiasing pairs each pixel with itself one frame earlier, so the first frame
    // only establishes a baseline and the second has no predecessor to pair with.
    // Three frames is therefore the true minimum, and a two-frame "capture" must
    // yield nothing rather than something weak.
    const collector = new CameraNoiseCollector({ minFrames: 1, minDurationMs: 0, requiredBits: 8 });
    for (const frame of capture({ frameCount: 2 })) collector.addFrame(frame);
    expect(collector.stats().rawBits).toBe(0);
    expect(() => collector.finalize()).toThrow(/camera entropy/);
  });

  it('needs progressively more entropy as the seed grows', () => {
    // A deliberately thin capture: enough frames for temporal pairing to work, but
    // few enough that the credit stays below a large target.
    const frames = capture({ frameCount: 6 });
    const build = (requiredBits: number) => {
      const collector = new CameraNoiseCollector({ requiredBits, minFrames: 1, minDurationMs: 0 });
      for (const frame of frames) collector.addFrame(frame);
      return collector;
    };
    const small = build(128);
    const large = build(2048);
    expect(small.finalize().bytes.length).toBe(16);
    expect(large.stats().estimatedMinEntropyBits).toBeLessThan(2048);
    expect(() => large.finalize()).toThrowError(/need 2048 bits/);
  });

  it('folds interactions and aux entropy into the transcript', () => {
    const frames = capture();
    const collect = (withMixers: boolean) => {
      const collector = new CameraNoiseCollector({ minFrames: 1, minDurationMs: 0, includeDeviceCsprng: false });
      for (const frame of frames) collector.addFrame(frame);
      if (withMixers) {
        for (const sample of interactionSamples(20)) collector.addInteraction(sample);
        collector.addAuxEntropyFromString('dice: 4 2 6 1 3 5 2');
      }
      return collector.finalize();
    };
    const plain = collect(false);
    const mixed = collect(true);
    expect(Buffer.from(mixed.bytes).toString('hex')).not.toBe(Buffer.from(plain.bytes).toString('hex'));
    expect(mixed.stats.interactions).toBe(20);
    // Mixers never inflate the entropy claim.
    expect(mixed.estimatedMinEntropyBits).toBe(plain.estimatedMinEntropyBits);
    expect(mixed.sources.filter((s) => s.estimatedMinEntropyBits > 0).map((s) => s.name)).toEqual([
      'camera-read-noise',
      'camera-quantization-jitter',
    ]);
  });

  it('rejects malformed frames and interactions', () => {
    const collector = new CameraNoiseCollector();
    expect(() =>
      collector.addFrame({ data: new Uint8Array(10), width: 4, height: 4, timestamp: 0 }),
    ).toThrow(/does not match/);
    expect(() =>
      collector.addFrame({ data: new Uint8Array(4), width: 2, height: 2, timestamp: 0 }),
    ).not.toThrow();
    expect(() =>
      collector.addInteraction({ timestamp: Number.NaN, x: 0, y: 0 }),
    ).toThrow(/non-finite/);
  });

  it('resets back to a clean slate', () => {
    const collector = new CameraNoiseCollector({ minFrames: 1, minDurationMs: 0 });
    for (const frame of capture({ frameCount: 5 })) collector.addFrame(frame);
    expect(collector.stats().frames).toBe(5);
    collector.reset();
    const stats = collector.stats();
    expect(stats.frames).toBe(0);
    expect(stats.rawBits).toBe(0);
    expect(stats.estimatedMinEntropyBits).toBe(0);
  });

  it('never leaks the raw accumulator into the audit digest', () => {
    const collector = new CameraNoiseCollector({ minFrames: 1, minDurationMs: 0, includeDeviceCsprng: false });
    for (const frame of capture({ frameCount: 40 })) collector.addFrame(frame);
    const result = collector.finalize();
    const seedHex = Buffer.from(result.bytes).toString('hex');
    expect(result.transcriptDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.transcriptDigest).not.toBe(seedHex);
  });

  it('supports 12/18/24-word seed sizes', () => {
    for (const [bits, bytes] of [
      [128, 16],
      [192, 24],
      [256, 32],
    ] as const) {
      const collector = new CameraNoiseCollector({ requiredBits: bits, minFrames: 1, minDurationMs: 0 });
      for (const frame of capture({ frameCount: 30 })) collector.addFrame(frame);
      expect(collector.finalize().bytes.length).toBe(bytes);
    }
  });

  it('rejects nonsensical configuration', () => {
    expect(() => new CameraNoiseCollector({ requiredBits: 100 })).toThrow(/multiple of 8/);
    expect(() => new CameraNoiseCollector({ requiredBits: 0 })).toThrow(/positive/);
    expect(() => new CameraNoiseCollector({ requiredBits: 256, bitsPerDebiasedBit: 1e-9 })).toThrow(
      /too pessimistic/,
    );
  });
});

function pack(bits: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, i) => {
    if (bit) out[i >>> 3] |= 1 << (i & 7);
  });
  return out;
}

// Keeps the `unhex` helper referenced for future vector-based tests.
void unhex;
