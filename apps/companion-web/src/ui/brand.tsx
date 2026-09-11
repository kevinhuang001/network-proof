import type { ReactNode } from 'react';

/** The wallet's mark, shared by the header and the empty state. */
export function BrandMark({ size = 22 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <rect width="128" height="128" rx="30" fill="#0B0B0F" />
      <path d="M34 88V40h13l18 27V40h13v48H65L47 61v27H34z" fill="#FFFFFF" />
      <circle cx="90" cy="50" r="8" fill="#0ECB81" />
    </svg>
  );
}
