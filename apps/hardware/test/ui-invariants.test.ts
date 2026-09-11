import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level invariants for the UI.
 *
 * Unusual as tests go, but this defect class is worth pinning: a *styling* utility
 * silently removed interactivity, so a text field the user had to type into could
 * not be focused at all. It shipped, and the symptom the user saw was a word counter
 * stuck at "0 个单词" with no error anywhere — the kind of failure that is expensive
 * to diagnose and trivial to prevent.
 */

const repoRoot = resolve(__dirname, '../../..');
const themePath = join(repoRoot, 'packages/ui/src/theme.css');
const theme = readFileSync(themePath, 'utf8');

/** Body of a CSS rule, by selector. */
function ruleBody(css: string, selector: string): string {
  const index = css.indexOf(`\n${selector} {`);
  expect(index, `selector ${selector} should exist in theme.css`).toBeGreaterThan(-1);
  const open = css.indexOf('{', index);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

describe('UI invariants', () => {
  it('the blur utility does not disable interaction', () => {
    // The exact bug: `.np-blur { pointer-events: none }` applied to a <textarea>.
    const blur = ruleBody(theme, '.np-blur');
    expect(blur).toContain('filter: blur');
    expect(blur).not.toContain('pointer-events');

    // A separate, explicitly named class may be inert, so the capability is not
    // lost — it just has to be asked for by name.
    expect(ruleBody(theme, '.np-blur--inert')).toContain('pointer-events: none');
  });

  it('never applies the inert blur class to an input or textarea', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(__dirname, '../src'))) {
      const source = readFileSync(file, 'utf8');
      // Find each <input / <textarea tag and check the className within it.
      for (const match of source.matchAll(/<(input|textarea)\b[\s\S]{0,400}?\/?>/gu)) {
        const tag = match[0]!;
        if (/np-blur/.test(tag)) offenders.push(`${file}: ${tag.slice(0, 60)}…`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('offers no choice about storing the passphrase', () => {
    // Product decision: a BIP39 passphrase is always stored in the vault alongside the
    // mnemonic, so signing never asks for it again. An earlier build exposed a
    // checkbox for this; re-introducing one would silently change the security model,
    // so pin it with a test rather than a comment.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(__dirname, '../src'))) {
      const source = readFileSync(file, 'utf8');
      // Any checkbox whose checked/onChange wiring mentions the storage flag.
      for (const match of source.matchAll(/<input\b[\s\S]{0,300}?\/?>/gu)) {
        if (/storePassphrase/.test(match[0]!)) offenders.push(`${file}: ${match[0]!.slice(0, 70)}…`);
      }
      if (/setStorePassphrase/.test(source)) offenders.push(`${file}: still contains setStorePassphrase`);
    }
    expect(offenders).toEqual([]);
  });

  it('never navigates with a fragment link, because routing is state-based', () => {
    // This app routes with React state (useState + a `go()` callback) and has no hash
    // router. An <a href="#/something"> therefore changes the URL fragment and does
    // nothing else — no error, no navigation, no feedback. That is precisely how the
    // two device actions ("登录插件钱包" / "扫描并签名") once shipped as dead buttons.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(__dirname, '../src'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<a\b[\s\S]{0,200}?>/gu)) {
        if (/href=/u.test(match[0]!)) offenders.push(`${file}: ${match[0]!.slice(0, 60)}…`);
      }
      // Anchors built through a variable are just as broken; forbid href outright.
      if (/href=\{/u.test(source)) offenders.push(`${file}: href={...} in a state-routed app`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the camera overlay transparent to taps', () => {
    // The reticle must not swallow touches aimed at the video element.
    expect(ruleBody(theme, '.np-camera__overlay')).toContain('pointer-events: none');
  });
});
