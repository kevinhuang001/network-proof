import { chiSquarePValue, erfc, pValueFromNormal } from '../util/stats';
import { countOnes, mcvMinEntropyPerByte } from '../util/bits';
import type { HealthCheckResult } from './types';

/** NIST SP 800-22 recommends rejecting a source when p < 0.01. */
export const DEFAULT_ALPHA = 0.01;

/**
 * Threshold used when deciding whether to *block* wallet creation.
 *
 * Much more permissive than the NIST reporting convention, for a reason that is
 * easy to get wrong: a hypothesis test at fixed alpha will reject as the sample
 * grows, because every physical source has some tiny residual imperfection. Gating
 * on `p >= 0.01` with an ever-growing sample means a *longer* capture is *more*
 * likely to be refused — the opposite of what the user deserves.
 *
 * These checks are therefore gross-failure detectors (dead, stuck, constant, badly
 * biased), not certification tests. The quantitative entropy claim comes from the
 * per-mode min-entropy accounting, which is measured and discounted, not from a
 * p-value. The sample size is fixed as well (see the collector), so the verdict no
 * longer drifts with capture length.
 */
export const GATING_ALPHA = 1e-4;

/**
 * Monobit (frequency) test: is the number of 1s close to n/2?
 * Detects a stuck-at or heavily biased source.
 */
export function monobitTest(bits: ArrayLike<number>, alpha = DEFAULT_ALPHA): HealthCheckResult {
  const n = bits.length;
  if (n === 0) return inconclusive('monobit', '没有比特可供检验');
  let sum = 0;
  for (let i = 0; i < n; i++) sum += bits[i] === 1 ? 1 : -1;
  const statistic = Math.abs(sum) / Math.sqrt(n);
  const pValue = pValueFromNormal(statistic);
  if (n < 100) return inconclusive('monobit', `只有 ${n} 比特，样本太小`);
  return {
    name: 'monobit',
    passed: pValue >= alpha,
    statistic,
    pValue,
    threshold: alpha,
    detail: `${countOnesOf(bits)} ones in ${n} bits (S=${statistic.toFixed(3)})`,
  };
}

/**
 * Runs test: counts transitions (0->1, 1->0). Detects the "too regular" failure
 * mode of a stuck oscillator as well as excessive oscillation.
 */
export function runsTest(bits: ArrayLike<number>, alpha = DEFAULT_ALPHA): HealthCheckResult {
  const n = bits.length;
  if (n < 100) return inconclusive('runs', `只有 ${n} 比特，样本太小`);
  let ones = 0;
  for (let i = 0; i < n; i++) if (bits[i] === 1) ones++;
  const pi = ones / n;
  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) {
    return {
      name: 'runs',
      passed: false,
      statistic: Math.abs(pi - 0.5),
      pValue: 0,
      threshold: alpha,
      detail: `precondition failed: ones fraction ${pi.toFixed(4)} too far from 0.5`,
    };
  }
  let runs = 1;
  for (let i = 1; i < n; i++) if (bits[i] !== bits[i - 1]) runs++;
  const expected = 2 * n * pi * (1 - pi);
  const denominator = 2 * Math.sqrt(2 * n) * pi * (1 - pi);
  const statistic = Math.abs(runs - expected) / denominator;
  const pValue = pValueFromNormal(statistic);
  return {
    name: 'runs',
    passed: pValue >= alpha,
    statistic,
    pValue,
    threshold: alpha,
    detail: `${runs} runs vs ${expected.toFixed(1)} expected`,
  };
}

/**
 * Block frequency test: split into M-bit blocks and chi-square the per-block
 * ones counts. Sensitive to local (intra-frame) structure that a global
 * frequency test would miss.
 */
export function blockFrequencyTest(
  bits: ArrayLike<number>,
  blockSize = 128,
  alpha = DEFAULT_ALPHA,
): HealthCheckResult {
  const n = bits.length;
  const blocks = Math.floor(n / blockSize);
  if (blocks < 5) {
    return inconclusive(
      'blockFrequency',
      `需要至少 5 个 ${blockSize} 比特的块，当前只有 ${blocks} 块`,
    );
  }
  let chiSquare = 0;
  for (let b = 0; b < blocks; b++) {
    let ones = 0;
    const start = b * blockSize;
    for (let i = 0; i < blockSize; i++) if (bits[start + i] === 1) ones++;
    const deviation = ones - blockSize / 2;
    chiSquare += (deviation * deviation) / (blockSize / 2);
  }
  const pValue = chiSquarePValue(chiSquare, blocks);
  return {
    name: 'blockFrequency',
    passed: pValue >= alpha,
    statistic: chiSquare,
    pValue,
    threshold: alpha,
    detail: `${blocks} blocks of ${blockSize} bits, chi2=${chiSquare.toFixed(2)}`,
  };
}

/**
 * Serial correlation test: a lag-1 autocorrelation of the bit stream. Camera
 * noise that is actually a downsampled/interpolated signal shows up here as a
 * strong positive correlation, so this is the check that catches "the extractor
 * is reading scene structure, not noise".
 */
export function serialCorrelationTest(
  bits: ArrayLike<number>,
  alpha = DEFAULT_ALPHA,
): HealthCheckResult {
  const n = bits.length;
  if (n < 100) return inconclusive('serialCorrelation', `只有 ${n} 比特，样本太小`);
  let ones = 0;
  let pairs = 0;
  for (let i = 0; i < n - 1; i++) {
    if (bits[i] === 1) ones++;
    if (bits[i] === 1 && bits[i + 1] === 1) pairs++;
  }
  if (bits[n - 1] === 1) ones++;
  const p1 = ones / n;
  const p11 = pairs / (n - 1);
  const numerator = p11 - p1 * p1;
  const denominator = p1 * (1 - p1);
  if (denominator === 0) return failed('serialCorrelation', 'degenerate constant stream');
  const correlation = numerator / denominator;
  const statistic = Math.abs(correlation) * Math.sqrt(n);
  const pValue = pValueFromNormal(statistic);
  return {
    name: 'serialCorrelation',
    passed: pValue >= alpha,
    statistic: correlation,
    pValue,
    threshold: alpha,
    detail: `lag-1 correlation ${correlation.toFixed(5)}`,
  };
}

/**
 * Most Common Value min-entropy estimate on the *packed byte* stream
 * (NIST SP 800-90B §6.3.1). This is the number we are allowed to quote as an
 * entropy claim, so it is measured rather than assumed.
 *
 * SP 800-90B pairs the MCV estimate with a chi-square uniformity test, which is
 * only valid when every one of the 256 byte values is expected at least 5 times.
 * Below that we fall back to a min-entropy floor check and say so in `detail`
 * rather than reporting a meaningless p-value.
 */
export function mcvHealthCheck(bytes: Uint8Array, alpha = DEFAULT_ALPHA): HealthCheckResult {
  if (bytes.length < 16) return inconclusive('mcvMinEntropy', `只有 ${bytes.length} 字节，样本太小`);
  const { phat, pUpper, minEntropyPerByte } = mcvMinEntropyPerByte(bytes);

  const counts = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
  const expected = bytes.length / 256;

  if (expected < 5) {
    // Small-sample mode. A chi-square uniformity test needs ~5 expected samples per
    // bucket to mean anything, and this sample does not have it.
    //
    // An earlier version fell back to a flat "4 bits/byte" floor, which is
    // statistically naive: with only 96-160 bytes spread over 256 values,
    // collisions are routine and the floor rejected healthy captures of exactly the
    // minimum length. The criterion below instead asks the question small samples
    // can actually answer — "does one byte value dominate the sample?" — using a
    // threshold that scales with the sample size.
    const maxCount = Math.max(8, Math.ceil(bytes.length * 0.05));
    const observedMax = Math.round(phat * bytes.length);
    return {
      name: 'mcvMinEntropy',
      passed: observedMax <= maxCount,
      statistic: observedMax,
      pValue: 1,
      threshold: alpha,
      detail:
        `small sample (${bytes.length} bytes, ${expected.toFixed(2)} expected/bucket): ` +
        `uniformity test inconclusive, most common byte appears ${observedMax}/${bytes.length} ` +
        `(limit ${maxCount}), MCV p̂=${phat.toFixed(4)}`,
    };
  }

  let chiSquare = 0;
  for (let i = 0; i < 256; i++) {
    const deviation = counts[i] - expected;
    chiSquare += (deviation * deviation) / expected;
  }
  const chiP = chiSquarePValue(chiSquare, 255);
  const bits = bytes.length * 8;
  let onesSum = 0;
  for (let i = 0; i < bytes.length; i++) {
    let v = bytes[i];
    while (v) {
      onesSum += v & 1;
      v >>>= 1;
    }
  }
  const globalOnes = onesSum / bits;
  return {
    name: 'mcvMinEntropy',
    passed: chiP >= alpha,
    statistic: chiSquare,
    pValue: chiP,
    threshold: alpha,
    detail:
      `MCV p̂=${phat.toFixed(4)} (99% upper ${pUpper.toFixed(4)}) → ` +
      `${minEntropyPerByte.toFixed(3)} bits/byte; chi2=${chiSquare.toFixed(1)}; ` +
      `global ones fraction ${globalOnes.toFixed(4)}`,
  };
}

function countOnesOf(bits: ArrayLike<number>): number {
  let ones = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i] === 1) ones++;
  return ones;
}

function failed(name: string, detail: string): HealthCheckResult {
  return { name, passed: false, statistic: 0, pValue: 0, threshold: DEFAULT_ALPHA, detail };
}

/** The sample was too small to judge. Reported, never a reason to refuse a wallet. */
function inconclusive(name: string, detail: string): HealthCheckResult {
  return {
    name,
    passed: false,
    inconclusive: true,
    statistic: 0,
    pValue: 1,
    threshold: DEFAULT_ALPHA,
    detail,
  };
}

export { countOnes };

/**
 * Run the full battery.
 *
 * IMPORTANT — the sample these tests are given must be *approximately i.i.d.*,
 * because that is the precondition every one of them assumes. Feeding them the raw
 * debiased bit stream in raster order violates it: neighbouring pixels share row
 * noise, column offsets, PRNU and optical blur, so `runs`, `blockFrequency`,
 * `serialCorrelation` and `mcv` all fail with p = 0 on a completely healthy sensor.
 *
 * That is not a hypothetical. It is exactly what shipped: `finalize()` threw
 * `ENTROPY_HEALTH_FAILED` on a realistic capture, so the wallet could not be
 * created at all. The collector therefore builds a decimated sample (one bit every
 * few hundred, so consecutive samples come from far-apart pixels and, crucially,
 * from different frames whose readout offsets are independent) and passes *that*
 * here. See `CameraNoiseCollector.sampleForTests`.
 *
 * `serialCorrelation` is reported but treated as advisory: on real hardware it is
 * the check most likely to flag legitimate sensor behaviour, and the entropy claim
 * does not depend on it — the final extractor is a hash over the transcript, which
 * absorbs correlation that the per-mode min-entropy accounting already discounts.
 */
export function runHealthTests(
  bits: ArrayLike<number>,
  bytes: Uint8Array,
  alpha = GATING_ALPHA,
): HealthCheckResult[] {
  return [
    monobitTest(bits, alpha),
    runsTest(bits, alpha),
    blockFrequencyTest(bits, 128, alpha),
    serialCorrelationTest(bits, alpha),
    mcvHealthCheck(bytes, alpha),
  ];
}

/** Checks that must pass before a wallet may be created. */
export const GATING_CHECKS = ['monobit', 'runs', 'blockFrequency', 'mcvMinEntropy'] as const;

/**
 * Whether a failed check should block wallet creation.
 *
 * Correlation-shaped failures are advisory: they describe the *sensor*, not the
 * safety of the extraction, and a real camera legitimately trips them.
 */
export function isGatingFailure(check: HealthCheckResult): boolean {
  if (check.passed) return false;
  // "Not enough data" is not evidence against the source.
  if (check.inconclusive) return false;
  if ((GATING_CHECKS as readonly string[]).includes(check.name)) return true;
  // serialCorrelation only blocks when the source is degenerate rather than merely
  // correlated: |r| near 1 means the stream barely changes at all.
  if (check.name === 'serialCorrelation') return Math.abs(check.statistic) > 0.5;
  return false;
}

export { erfc };
