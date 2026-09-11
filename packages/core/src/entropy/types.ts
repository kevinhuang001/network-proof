/** Public types for the camera-noise true-random-number generator. */

/** One grayscale camera frame. `data.length` must equal `width * height`. */
export interface GrayscaleFrame {
  data: Uint8Array;
  width: number;
  height: number;
  /** Milliseconds on any monotonic clock; only used for rate/duration checks. */
  timestamp: number;
}

/**
 * A sample of human interaction (touch/pointer), used as an *additional* entropy
 * source. We never rely on it alone: it is hashed together with the camera noise.
 */
export interface InteractionSample {
  timestamp: number;
  x: number;
  y: number;
  /** Optional sub-pixel pressure/size value, when the platform provides one. */
  force?: number;
}

export interface HealthCheckResult {
  name: string;
  passed: boolean;
  /**
   * The check could not reach a verdict because the sample was too small.
   *
   * Distinct from a failure, and never gates wallet creation: "the test had
   * insufficient data" is not evidence of a bad entropy source, and treating it as
   * one made short captures impossible to complete.
   */
  inconclusive?: boolean;
  statistic: number;
  pValue: number;
  /** Smallest p-value still considered acceptable (NIST SP 800-22 convention: 0.01). */
  threshold: number;
  detail: string;
}

export interface EntropySourceReport {
  name: string;
  /** Bits produced by this source before conservative discounting. */
  rawBits: number;
  /** Bits kept after in-source filtering (e.g. debiasing discards). */
  acceptedBits: number;
  /** Conservative lower bound contribution, in bits. */
  estimatedMinEntropyBits: number;
  note: string;
}

export interface CollectorStats {
  frames: number;
  interactions: number;
  /** Debiased bits accumulated so far. */
  rawBits: number;
  /** Conservative min-entropy estimate in bits (the number the UI shows). */
  estimatedMinEntropyBits: number;
  requiredBits: number;
  /** 0..1 progress towards `requiredBits`. */
  progress: number;
  durationMs: number;
  /** Fraction of 1-bits before debiasing, for the diagnostics screen. */
  onesFraction: number;
  /** Pixels dropped because their temporal delta looked scene-driven, not noise. */
  rejectedPixels: number;
  /**
   * True when the sensor is contributing ~no fresh noise (frozen or covered lens).
   *
   * This is *debounced*: see `STALL_ENTER_FRAMES`. A single frame can legitimately
   * earn no marginal credit on a perfectly healthy sensor — debiasing may discard a
   * run-heavy frame entirely — so a raw per-frame flag flickers, and every consumer
   * of it flickers with it.
   */
  lastFrameStalled: boolean;
}

/**
 * Why a wallet seed cannot be produced yet, as data rather than prose.
 *
 * The prose form (`blockingReasons`) is for error messages and logs. A UI must not
 * render it: it embeds live numbers, so its length changes every frame, and English
 * text inside a Chinese interface is the wrong language for the user in front of it.
 */
export type EntropyBlocker =
  | { code: 'frames'; have: number; need: number }
  | { code: 'duration'; haveMs: number; needMs: number }
  | { code: 'entropy'; haveBits: number; needBits: number }
  | { code: 'stalled' };

export interface EntropyResult {
  /** Extracted randomness, `requiredBytes` long. This is the wallet master secret. */
  bytes: Uint8Array;
  requiredBits: number;
  rawBits: number;
  estimatedMinEntropyBits: number;
  healthy: boolean;
  health: HealthCheckResult[];
  sources: EntropySourceReport[];
  stats: CollectorStats;
  /**
   * Digest over the *statistics only* (never the raw accumulator), so it is safe
   * to log or display for auditing without weakening the derived secret.
   */
  transcriptDigest: string;
}

export interface CollectorOptions {
  /** Entropy required from the camera alone, in bits. Default 256 (24-word seed). */
  requiredBits?: number;
  /**
   * Conservative lower bound on how much min-entropy each debiased noise bit
   * carries. Default 0.05 bits/bit: we assume that at most 1 in 20 extracted
   * bits is genuinely independent and unpredictable, which is deliberately far
   * below what a laboratory entropy assessment would grant a CMOS sensor.
   */
  bitsPerDebiasedBit?: number;
  /** |delta| above this is treated as scene motion / hot pixel, not sensor noise. */
  maxFrameDelta?: number;
  minFrames?: number;
  minDurationMs?: number;
  /** Mix host CSPRNG output in as defence-in-depth. Never the sole source. */
  includeDeviceCsprng?: boolean;
  /** Mix in an extra caller-supplied secret (e.g. a dice roll the user typed). */
  auxEntropy?: Uint8Array;
}
