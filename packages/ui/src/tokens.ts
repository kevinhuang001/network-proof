/**
 * Design tokens.
 *
 * The look is deliberately "OKX-like": a bright near-white canvas, near-black ink,
 * very high contrast, large bold numerals, pill-shaped buttons and generously
 * rounded cards. For a wallet this is not only aesthetic — high contrast and big
 * type are what make an address or an amount readable at a glance on a phone held
 * at arm's length, which is exactly how a hardware wallet gets used.
 *
 * Only this file defines raw colour. Everything else uses the CSS custom
 * properties in `theme.css` so the two apps cannot drift apart.
 */

export const palette = {
  /** Canvas */
  bg: '#FFFFFF',
  bgSubtle: '#F6F7F9',
  bgSunken: '#EEF0F4',
  bgInverse: '#0B0B0F',

  /** Ink */
  ink: '#0B0B0F',
  inkSecondary: '#5B616E',
  inkTertiary: '#8A919E',
  inkInverse: '#FFFFFF',

  /** Lines */
  line: '#EBECF0',
  lineStrong: '#D9DCE3',

  /** Brand + semantics (the green/red pair is the exchange convention) */
  brand: '#0B0B0F',
  accent: '#2B6BFF',
  up: '#0ECB81',
  down: '#F6465D',
  warn: '#FFB020',
  sun: '#FFD24A',

  /** Fixed-colour surfaces that must not be themed by CSS variables */
  qrLight: '#FFFFFF',
  qrDark: '#0B0B0F',
} as const;

export type Tone = 'neutral' | 'up' | 'down' | 'warn' | 'accent';

export const toneColor: Record<Tone, string> = {
  neutral: palette.inkSecondary,
  up: palette.up,
  down: palette.down,
  warn: palette.warn,
  accent: palette.accent,
};

/** Type scale, in px. Display sizes are for amounts and addresses. */
export const type = {
  micro: 11,
  caption: 12,
  body: 14,
  bodyLarge: 16,
  title: 20,
  headline: 26,
  display: 34,
  amount: 40,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * QR rendering constants. A quiet zone of 4 modules and a dark/light pair with
 * maximum contrast are what make a code scannable from another phone's camera.
 */
export const qr = {
  quietZoneModules: 4,
  /** Pixels per module when painting to a canvas; the apps scale to fit. */
  defaultModulePx: 6,
  /** Milliseconds each frame is shown in an animated transfer. */
  frameDurationMs: 420,
  /** Level M tolerates ~15% damage, which is what a hand-held camera needs. */
  errorCorrectionLevel: 'M' as const,
} as const;

export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Group digits so large amounts stay readable: 1234567.89 -> 1,234,567.89 */
export function groupDigits(value: string): string {
  const [whole = '', fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
