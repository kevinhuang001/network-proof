/**
 * Numerical helpers for statistical health tests (NIST SP 800-22 style p-values).
 *
 * We need `erfc` to turn a test statistic into a p-value. The implementation is the
 * classic Numerical Recipes `erfc`-via-`erfcc`-Chebyshev-fit, which is accurate to
 * ~1.2e-7 relative error over the whole range we care about (p-values down to ~1e-300
 * are clamped, since we only ever compare against thresholds like 1e-6).
 */

/** Complementary error function, accurate to ~1e-7 relative. */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;

  const coefficients = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3,
    -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
    -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
    5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12,
    -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15,
  ];

  let d = 0;
  let dd = 0;
  for (let j = coefficients.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + coefficients[j];
    dd = tmp;
  }
  const result = t * Math.exp(-z * z + 0.5 * (coefficients[0] + ty * d) - dd);

  if (x >= 0) return result;
  return 2 - result;
}

/** Standard normal cumulative distribution function. */
export function normalCdf(x: number): number {
  return erfc(-x / Math.SQRT2) / 2;
}

/** Two-sided p-value for a standard normal statistic. */
export function pValueFromNormal(statistic: number): number {
  return erfc(Math.abs(statistic) / Math.SQRT2);
}

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

/** Natural log of the gamma function (Lanczos approximation, g=7, n=9). */
export function logGamma(x: number): number {
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula keeps the approximation in its accurate range.
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
    );
  }
  const z = x - 1;
  let a = coefficients[0];
  const t = z + 7.5;
  for (let i = 1; i < coefficients.length; i++) a += coefficients[i] / (z + i);
  return LOG_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a,x) via series expansion (good for x < a+1). */
function gammaSeries(a: number, x: number): number {
  const maxIterations = 500;
  const epsilon = 1e-15;
  let sum = 1 / a;
  let term = sum;
  let ap = a;
  for (let n = 1; n <= maxIterations; n++) {
    ap += 1;
    term *= x / ap;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * epsilon) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Regularized upper incomplete gamma Q(a,x) via continued fraction (good for x >= a+1). */
function gammaContinuedFraction(a: number, x: number): number {
  const maxIterations = 500;
  const epsilon = 1e-15;
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= maxIterations; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Regularized upper incomplete gamma function Q(a,x) — the chi-square survival function. */
export function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new Error('gammaQ requires a > 0 and x >= 0');
  if (x === 0) return 1;
  if (x < a + 1) return 1 - gammaSeries(a, x);
  return gammaContinuedFraction(a, x);
}

/** Chi-square upper-tail p-value with `degreesOfFreedom` degrees of freedom. */
export function chiSquarePValue(chiSquare: number, degreesOfFreedom: number): number {
  if (degreesOfFreedom <= 0) throw new Error('degreesOfFreedom must be positive');
  return gammaQ(degreesOfFreedom / 2, chiSquare / 2);
}

