import { useEffect, useState } from 'react';
import { QR_PRESETS, type QrSpeedPreset } from './qrPresets';

/**
 * Fall back to 「稳健」 while a QR code is on screen and nothing is completing.
 *
 * Why this is time-based, and why that is still honest: over an air gap the displaying
 * device has no channel back from the scanning device. It cannot know that the code is
 * being read. What it does know is that the code has been sitting there for N seconds,
 * and that the *only* reason to still be sitting there is that it has not been read.
 *
 * The fallback is safe even when that guess is wrong. Slower, smaller frames are strictly
 * easier to scan; the cost of a wrong guess is a slower transfer, never a failure. This
 * is why it downgrades only — it never speeds up again, and it never persists, so a user
 * who chose 「快速」 keeps 「快速」 for the next transfer.
 */
export function useRobustQrFallback(
  active: boolean,
  timeoutMs: number,
  preferred: QrSpeedPreset,
): { preset: QrSpeedPreset; downgraded: boolean } {
  const [downgraded, setDowngraded] = useState(false);

  useEffect(() => {
    if (!active) {
      setDowngraded(false);
      return;
    }
    const timer = setTimeout(() => setDowngraded(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [active, timeoutMs]);

  // 稳健 is the slowest preset on offer, so this is always a downgrade.
  return { preset: downgraded ? QR_PRESETS.robust : preferred, downgraded };
}
