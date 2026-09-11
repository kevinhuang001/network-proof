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

  it('owns the layout width in exactly one place', () => {
    // The defect: every device screen was supposed to be phone-sized, but only the
    // welcome screen carried a width wrapper, so opening the app at desktop width
    // stretched the wallet to 1200px. Width now comes from the single `.np-app`
    // shell that App() renders around the router.
    for (const app of ['apps/hardware/src/App.tsx', 'apps/companion-web/src/App.tsx']) {
      const source = readFileSync(join(repoRoot, app), 'utf8');
      expect(source, `${app} must render the phone-width shell`).toContain('"np-app"');
    }

    // A screen must never cap its own width: `.np-fullscreen` did, which is why the
    // welcome screen was narrow while the rest of the app was not.
    expect(ruleBody(theme, '.np-fullscreen')).not.toContain('max-width');
  });

  it('never leaves a touch device narrower than its own screen', () => {
    // `max-width: 420px` assumed 420px is what a phone is. It is not: a 1080px panel
    // at a density of 2.25 reports a 480px viewport, so the app drew itself 420 wide
    // and left a 30px strip of page background down each side. The cap therefore
    // belongs to pointer-fine desktop only — never to a phone, at any density.
    expect(ruleBody(theme, '.np-app')).not.toContain('max-width');

    const desktop = theme.slice(theme.indexOf('@media (min-width: 520px) and (hover: hover)'));
    expect(desktop, 'the phone-width card must be desktop-only').toContain('pointer: fine');
    expect(desktop).toContain('max-width: var(--np-phone-width)');
  });

  it('never lets live text move a button', () => {
    // The capture screen printed its blocker reasons directly above the action button.
    // The text embeds live counters, so it re-wrapped a few times a second and the
    // button under it jumped while the user was aiming at it. Anything that changes at
    // frame rate goes in the fixed-height slot instead.
    expect(ruleBody(theme, '.np-hint-slot')).toContain('white-space: nowrap');
    expect(ruleBody(theme, '.np-hint-slot')).toContain('overflow: hidden');

    const capture = readFileSync(join(__dirname, '../src/screens/Capture.tsx'), 'utf8');
    const footer = capture.slice(capture.indexOf('<div className="np-footer">'));
    expect(footer, 'live text must not live in the footer').not.toMatch(/blockerText/);
  });

  it('treats an interrupted camera start as a cancellation, not a failure', () => {
    // React StrictMode mounts every camera effect twice in development, so the second
    // mount reassigns `srcObject` while the first attempt's `play()` is still pending.
    // Chromium rejects that promise with AbortError, and it was surfacing to the user as
    // "无法打开摄像头：The play() request was interrupted by a new load request" — an error
    // notice about a camera that was open and working, on the first screen of the app.
    // The first attempt also kept its stream: a real camera, running, that nothing read.
    const offenders: string[] = [];
    for (const app of ['hardware', 'companion-web', 'extension']) {
      for (const file of sourceFiles(join(repoRoot, 'apps', app, 'src'))) {
        const source = readFileSync(file, 'utf8');
        if (!source.includes('getUserMedia')) continue;
        if (!/AbortError|isAbortError/u.test(source)) {
          offenders.push(`${file}: awaits play() without handling an interrupted one`);
        }
        // A cancelled attempt must not have its stream taken by a newer one, and must
        // not clear a stream it does not own.
        for (const match of source.matchAll(/\.srcObject = null/gu)) {
          const before = source.slice(Math.max(0, match.index - 120), match.index);
          if (!before.includes('srcObject === ')) {
            offenders.push(`${file}: clears srcObject without checking ownership`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has a flex-gap fallback for every flex container that declares a gap', () => {
    // WebView 84 is where flexbox `gap` landed, and `@supports` cannot detect it (WebView
    // 69 honours `gap` in grid containers, so the query returns true while every flex
    // container silently packs its children together). The fallback is therefore a list
    // of rules, and a list is only as good as the check that it is complete: a new
    // `.np-thing { display: flex; gap: 12px }` without a matching legacy rule is spacing
    // that vanishes on the exact device this app is built for.
    const missing: string[] = [];
    for (const match of theme.matchAll(/\n([^{}\n]+)\{([^{}]*)\}/gu)) {
      const selector = match[1]!.trim();
      const body = match[2]!;
      if (!body.includes('display: flex') || !body.includes('gap:')) continue;
      // Only the plain, standalone class selectors are covered by the fallback list.
      if (!/^\.[\w-]+$/u.test(selector)) continue;
      if (!theme.includes(`html.np-no-flex-gap ${selector} > * + *`)) missing.push(selector);
    }
    expect(missing).toEqual([]);
  });

  it('ships every network logo it references, in every app', () => {
    // A missing logo is a broken image in the network picker — the one control a user
    // checks to confirm which chain they are signing on. The map and the files are
    // separate artifacts, so they are checked against each other here.
    const networks = readFileSync(join(repoRoot, 'packages/ui/src/networks.ts'), 'utf8');
    const logos = [...networks.matchAll(/logo: '([^']+)'/gu)].map((match) => match[1]!);
    expect(logos.length).toBeGreaterThan(4);

    const missing: string[] = [];
    for (const app of ['hardware', 'companion-web', 'extension']) {
      for (const logo of logos) {
        const file = join(repoRoot, 'apps', app, 'public/logos', logo);
        try {
          if (statSync(file).size === 0) missing.push(`${app}: empty ${logo}`);
        } catch {
          missing.push(`${app}: missing ${logo}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the compatibility shim ES5 and loads it before the bundle', () => {
    // The shim installs features that older WebViews lack, so it cannot be allowed to
    // use them itself, and it cannot go through the bundler (which would emit syntax the
    // same WebView cannot parse). Both properties are invisible until the app is on the
    // old phone, where a syntax error is a white screen and no console.
    const shim = readFileSync(join(__dirname, '../public/compat.js'), 'utf8');
    // Comments may say anything (they quote the very features being avoided); only code
    // has to parse on a 2018 WebView.
    const code = shim.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    expect(code).not.toMatch(/=>/u);
    expect(code).not.toMatch(/\b(const|let)\s/u);
    expect(code).not.toMatch(/`/u);
    expect(shim).toMatch(/typeof globalThis !== 'undefined'/u);

    for (const entry of ['apps/hardware/index.html', 'apps/companion-web/index.html']) {
      const html = readFileSync(join(repoRoot, entry), 'utf8');
      const shimAt = html.indexOf('compat.js');
      const bundleAt = html.indexOf('type="module"');
      expect(shimAt, `${entry} must load the shim`).toBeGreaterThan(-1);
      expect(shimAt, `${entry} must load the shim before the bundle`).toBeLessThan(bundleAt);
    }
  });

  it('builds every app for the WebView floor it claims', () => {
    // The floor is 67 because BigInt arrived there and no polyfill provides it. A target
    // of `es2022` ships `??=` and class fields that a 2018 WebView cannot parse at all.
    const configs = [
      'apps/hardware/vite.config.ts',
      'apps/companion-web/vite.config.ts',
      'apps/extension/vite.config.ts',
      'apps/extension/vite.content.config.ts',
      'apps/extension/vite.worker.config.ts',
    ];
    for (const config of configs) {
      const source = readFileSync(join(repoRoot, config), 'utf8');
      expect(source, `${config} must target the WebView floor`).toContain("'chrome67'");
    }
  });
});
