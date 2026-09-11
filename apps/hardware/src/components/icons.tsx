import type { ReactNode } from 'react';
import { networkLogoUrl } from '@netproof/ui/networks';

/**
 * Inline SVG icons.
 *
 * A hardware wallet's screen is mostly words, and words are what people stop
 * reading. Small, recognisable marks carry the same information faster — a shield
 * for "this never leaves the device", a QR for "scan", a key for "sign". They are
 * inlined rather than loaded from a sprite or an icon font so the app keeps its
 * "no external resources" property and still renders offline.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 24,
  className,
  children,
  viewBox = '0 0 24 24',
}: IconProps & { children: ReactNode; viewBox?: string }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Ethereum diamond, filled. Used for the native-asset badge. */
export function EthIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2 5.5 12.2 12 16l6.5-3.8z" fill="currentColor" opacity="0.95" />
      <path d="M12 17.4 5.5 13.6 12 22l6.5-8.4z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

/** A stylised 'S' bars mark, standing in for the Solana logo. */
export function SolIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="currentColor">
        <path d="M6 6.2c0-.3.2-.5.5-.5h10.8c.3 0 .5.3.3.6l-1.6 1.9a.5.5 0 0 1-.4.2H4.8a.5.5 0 0 1-.3-.6z" opacity="0.9" />
        <path d="M6 15.6c0-.3.2-.5.5-.5h10.8c.3 0 .5.3.3.6l-1.6 1.9a.5.5 0 0 1-.4.2H4.8a.5.5 0 0 1-.3-.6z" opacity="0.7" />
        <path d="M18 10.9c0-.3-.2-.5-.5-.5H6.7a.5.5 0 0 0-.4.2l-1.6 1.9a.5.5 0 0 0 .3.6h10.8a.5.5 0 0 0 .4-.2z" opacity="0.5" />
      </g>
    </svg>
  );
}

/** Watch-only eye: the companion can see, but cannot sign. */
export function EyeIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

/** Key: signing. */
export function KeyIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l9 9M17 17l2-2M14 14l2-2" />
    </Svg>
  );
}

/** Shield with a check: the air gap. */
export function ShieldIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

/** Wallet: a mnemonic / wallet entity. */
export function WalletIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M16.5 14.5h.01" />
    </Svg>
  );
}

export function PlusIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function TrashIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </Svg>
  );
}

export function CheckIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M5 13l4 4L19 7" />
    </Svg>
  );
}

/** Settings. Drawn rather than written, so it looks the same on every device. */
export function GearIcon({ size = 22, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.06A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.06A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6h.08A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.06a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.9v.08a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.06a1.7 1.7 0 0 0-1.54 1.03z" />
    </Svg>
  );
}

/** Padlock, for the lock action in the top-right menu. */
export function LockIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.6" />
      <path d="M8.2 10.5V7.9a3.8 3.8 0 0 1 7.6 0v2.6" />
    </Svg>
  );
}

/** Right chevron, for rows that lead somewhere. */
export function ChevronRightIcon({ size = 22, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Svg>
  );
}

/**
 * Kebab menu. Three dots, the shape every phone user already reads as "more".
 *
 * Drawn rather than typed: a '⋮' glyph renders at a different weight, width and vertical
 * centre on every device, and this icon sits in the same slot as the app's other icons.
 */
export function MoreIcon({ size = 22, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="5" r="1.85" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.85" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.85" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Back chevron. A glyph like '‹' renders at a different weight on every device. */
export function ChevronLeftIcon({ size = 22, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  );
}

export function QrIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <path d="M14.5 14.5h2.5v2.5h-2.5zM20.5 20.5h-2M20.5 14.5v2" />
    </Svg>
  );
}

export function LinkIcon({ size = 24, className }: IconProps): ReactNode {
  return (
    <Svg size={size} className={className}>
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </Svg>
  );
}

/**
 * Real network logo, from the bundled asset set.
 *
 * This was a hand-drawn diamond for "some chain", a yellow circle with a `B` for BNB
 * Chain and a Solana glyph — three approximations of trademarks, in a wallet whose whole
 * job is to show the user which chain they are about to sign on. The actual logos are
 * small files; there is no reason to redraw them.
 */
export function ChainLogo({
  chainId,
  size = 28,
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
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--np-bg-sunken)',
          fontSize: size * 0.4,
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
