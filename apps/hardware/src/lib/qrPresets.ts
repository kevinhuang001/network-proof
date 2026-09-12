/**
 * QR transfer speed presets, in one place.
 *
 * These were three inline literals in the settings screen, and the same three numbers
 * were then re-typed in the auto-fallback. A preset that exists in two places is a preset
 * that will disagree with itself.
 *
 * Bigger `fragmentLength` means more bytes per frame, so fewer frames to scan but denser
 * codes that are harder for a phone camera to resolve. `frameDurationMs` is how long each
 * frame is held.
 *
 * `fragmentLength` is now a **ceiling**, not a decision: `autoFramesForMessage` lowers it until
 * a frame is small enough for a camera to resolve, and only comes back up to the ceiling when
 * doing so would stretch the transfer over `MAX_AUTO_FRAMES` frames. The three presets keep
 * their meaning for large payloads — an EIP-712 request with a big struct — and for the small
 * ones they converge, because density is what decides whether a code scans at all.
 */
export interface QrSpeedPreset {
  /** Bytes carried per frame. */
  fragmentLength: number;
  /** How long each frame stays on screen. */
  frameDurationMs: number;
}

export const QR_PRESETS = {
  /** Slow and sparse: the fallback when scanning is not working. */
  robust: { fragmentLength: 200, frameDurationMs: 520 },
  balanced: { fragmentLength: 300, frameDurationMs: 420 },
  fast: { fragmentLength: 500, frameDurationMs: 320 },
} as const satisfies Record<string, QrSpeedPreset>;

export const QR_PRESET_ORDER: Array<{ label: string; preset: QrSpeedPreset }> = [
  { label: '稳健', preset: QR_PRESETS.robust },
  { label: '均衡', preset: QR_PRESETS.balanced },
  { label: '快速', preset: QR_PRESETS.fast },
];

/**
 * How long a QR may sit unread before the display slows itself down.
 *
 * Login gets longer than signing: the user still has to reach the other device, open the
 * companion and grant the camera. By the time a signature is on screen they are already
 * holding the phone over it.
 */
export const ROBUST_FALLBACK_MS = {
  login: 15000,
  signature: 10000,
} as const;
