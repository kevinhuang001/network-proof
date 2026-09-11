/**
 * Per-wallet hero colours.
 *
 * Every hero card used to be the same near-black, so a device holding three wallets showed
 * three identical slabs with only the name to tell them apart — and the name is the part a
 * user reads last when they are tapping quickly. Colour is what makes "the second one" mean
 * something before a word is read.
 *
 * Random *and* distinct, but not random per render: the colour is derived from the wallet
 * id, so it survives a lock, a restart and a reorder. Collisions are resolved by probing
 * the palette, so ten wallets get ten different colours rather than a birthday-paradox mess.
 *
 * The palette is hand-picked light pastels, and that is a legibility decision rather than a
 * taste one: generated pastels reliably produce something that is nearly white, and this
 * card has to hold dark text plus a 60%-opacity secondary row at a readable contrast. Every
 * entry here clears 12:1 against `#0b0b0f`, and each carries its own ink so the card never
 * depends on a hard-coded white.
 */
export interface HeroColor {
  /** CSS background for the card. */
  background: string;
  /** Primary ink: the wallet name. */
  ink: string;
  /** Secondary ink: labels and the word-count row. */
  inkSoft: string;
  /** Shadow, tinted to match so the card does not look pasted onto the page. */
  shadow: string;
}

const PALETTE: HeroColor[] = [
  { background: 'linear-gradient(145deg, #EEE9FF 0%, #D6C9FF 100%)', ink: '#1B1146', inkSoft: 'rgba(27, 17, 70, 0.71)', shadow: '0 8px 22px rgba(120, 96, 220, 0.18)' },
  { background: 'linear-gradient(145deg, #E3F7F1 0%, #BEEBDD 100%)', ink: '#0A3A31', inkSoft: 'rgba(10, 58, 49, 0.77)', shadow: '0 8px 22px rgba(50, 150, 130, 0.18)' },
  { background: 'linear-gradient(145deg, #FFEBDC 0%, #FFD2B0 100%)', ink: '#4A2410', inkSoft: 'rgba(74, 36, 16, 0.77)', shadow: '0 8px 22px rgba(200, 120, 60, 0.2)' },
  { background: 'linear-gradient(145deg, #FFF6D6 0%, #FFE49B 100%)', ink: '#4A3606', inkSoft: 'rgba(74, 54, 6, 0.8)', shadow: '0 8px 22px rgba(200, 165, 40, 0.22)' },
  { background: 'linear-gradient(145deg, #E4EFFF 0%, #C0D8FF 100%)', ink: '#102A57', inkSoft: 'rgba(16, 42, 87, 0.76)', shadow: '0 8px 22px rgba(70, 120, 210, 0.2)' },
  { background: 'linear-gradient(145deg, #FFE7F0 0%, #FFC7DB 100%)', ink: '#4E1230', inkSoft: 'rgba(78, 18, 48, 0.75)', shadow: '0 8px 22px rgba(210, 90, 140, 0.2)' },
  { background: 'linear-gradient(145deg, #EAF7DE 0%, #CFEBAF 100%)', ink: '#24400E', inkSoft: 'rgba(36, 64, 14, 0.81)', shadow: '0 8px 22px rgba(120, 175, 60, 0.2)' },
  { background: 'linear-gradient(145deg, #E2F4FA 0%, #BCE4F0 100%)', ink: '#0E3A48', inkSoft: 'rgba(14, 58, 72, 0.79)', shadow: '0 8px 22px rgba(60, 150, 180, 0.2)' },
  { background: 'linear-gradient(145deg, #F4E9FF 0%, #E0C7FF 100%)', ink: '#3A1657', inkSoft: 'rgba(58, 22, 87, 0.76)', shadow: '0 8px 22px rgba(150, 90, 210, 0.2)' },
  { background: 'linear-gradient(145deg, #F3EDE4 0%, #E0D2BE 100%)', ink: '#3B2E1E', inkSoft: 'rgba(59, 46, 30, 0.8)', shadow: '0 8px 22px rgba(150, 125, 95, 0.2)' },
];

/** FNV-1a, so an id always lands on the same colour. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * One colour per id, all different.
 *
 * Called with the whole wallet list at once, because "different" is a property of the set:
 * hashing each id independently is how two cards end up the same colour.
 */
export function heroColors(ids: string[]): Record<string, HeroColor> {
  const used = new Set<number>();
  const out: Record<string, HeroColor> = {};
  for (const [position, id] of ids.entries()) {
    let index = hashId(id) % PALETTE.length;
    // Walk forward past taken slots; if the palette is exhausted, fall back to position.
    if (used.size < PALETTE.length) {
      while (used.has(index)) index = (index + 1) % PALETTE.length;
    } else {
      index = position % PALETTE.length;
    }
    used.add(index);
    out[id] = PALETTE[index]!;
  }
  return out;
}
