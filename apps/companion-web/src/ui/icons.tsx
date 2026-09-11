import type { ReactNode } from 'react';
import { networkLogoUrl } from '@netproof/ui/networks';

/**
 * Drawn icons, not glyphs.
 *
 * Characters like `⚙` and `‹` render at a different weight, baseline and even shape
 * depending on the platform's font, so a wallet that looks deliberate on one machine
 * looks broken on another. Everything the UI needs is drawn here instead.
 */

function Svg({ size = 22, className, children }: { size?: number; className?: string; children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ChevronLeftIcon({ size = 22, className }: { size?: number; className?: string }): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  );
}

export function GearIcon({ size = 22, className }: { size?: number; className?: string }): ReactNode {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.06A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.06A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6h.08A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.06a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.9v.08a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.06a1.7 1.7 0 0 0-1.54 1.03z" />
    </Svg>
  );
}

export function CheckIcon({ size = 22, className }: { size?: number; className?: string }): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Svg>
  );
}

/**
 * The chain's real logo, from the bundled asset set.
 *
 * Hand-drawn chain marks were the wrong kind of approximation here: the network picker
 * is exactly where a user checks *which* chain they are about to sign on, and a drawn
 * diamond that resembles every EVM chain's mark tells them nothing.
 */
export function ChainLogo({
  chainId,
  size = 26,
  className,
}: {
  chainId: number;
  size?: number;
  className?: string;
}): ReactNode {
  const url = networkLogoUrl(chainId);
  if (!url) {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          flex: 'none',
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--np-bg-sunken)',
          fontSize: size * 0.42,
          fontWeight: 700,
        }}
      >
        ?
      </span>
    );
  }
  return (
    <img
      className={className}
      src={url}
      width={size}
      height={size}
      alt=""
      style={{ width: size, height: size, display: 'block', flex: 'none' }}
    />
  );
}
