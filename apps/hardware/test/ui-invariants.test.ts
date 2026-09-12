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
    for (const app of ['apps/hardware/src/App.tsx', 'packages/companion-ui/src/App.tsx']) {
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

  it('never enables Capacitor input capture', () => {
    // `captureInput: true` takes the input method out of Chromium's IME pipeline: the
    // WebView hands the IME a `BaseInputConnection` bound to itself, composed text arrives
    // as `KeyEvent.ACTION_MULTIPLE`, and Capacitor's own `dispatchKeyEvent` runs
    // `document.activeElement.value = document.activeElement.value + characters`.
    //
    // That is a native, unconditional append into the focused field. Composing `clu` sends
    // `c`, then `cl`, then `clu`, and the field ends up holding `c` + `cl` + `clu` =
    // `cclclu` — the bug as reported, APK-only because the web build has no Capacitor.
    // It exists for hardware keyboard-wedge scanners; this device has none.
    const config = readFileSync(join(repoRoot, 'apps/hardware/capacitor.config.ts'), 'utf8');
    // The comments quote the value they are warning about; only real code counts.
    const code = config.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    expect(code).not.toMatch(/captureInput:\s*true/u);
    expect(code).toMatch(/captureInput:\s*false/u);

    // And the installed Capacitor really does behave that way — assert the mechanism, so a
    // future Capacitor upgrade that fixes it upstream shows up here rather than silently
    // making this comment a lie.
    const webView = join(
      repoRoot,
      'node_modules/.pnpm/@capacitor+android@8.5.1_@capacitor+core@8.5.1/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/CapacitorWebView.java',
    );
    try {
      const java = readFileSync(webView, 'utf8');
      expect(java).toContain('document.activeElement.value + ');
    } catch {
      // Capacitor is not installed in this checkout; the config assertion above still holds.
    }
  });

  it('never writes state back into a text field the user is typing in', () => {
    // The reported bug: typing `clu` into the backup quiz produced `cclclu`. The input was
    // controlled, and a phone keyboard does not type — it composes. It puts provisional
    // text in the field and rewrites that region as the user picks characters; React
    // writing its state back destroys the region the keyboard owns, so the keyboard
    // re-inserts its composition on top: `c` + `cl` + `clu` = `cclclu`.
    //
    // Every text field therefore goes through `@netproof/ui/text-field`, which is
    // uncontrolled while focused. Checkboxes are exempt: no keyboard, no composition.
    const offenders: string[] = [];
    // The companion's screens live in the shared package — the same code the extension runs,
    // which is the point: one place to check, one place to break.
    const uiRoots = ['apps/hardware/src', 'packages/companion-ui/src'];
    for (const root of uiRoots) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/<(input|textarea)\b[\s\S]{0,500}?\/?>/gu)) {
          const tag = match[0]!;
          if (/type="(checkbox|radio|file)"/u.test(tag)) continue;
          if (!/value=\{/u.test(tag)) continue;
          offenders.push(`${file}: ${tag.slice(0, 60)}…`);
        }
      }
    }
    // Only `src/` is scanned, which keeps the reproduction harness in `dev/` out of it:
    // that file deliberately contains the broken input, to compare against this fix.
    expect(offenders).toEqual([]);

    // And the shared component has to stay uncontrolled: a `value` prop here would
    // reintroduce exactly the write-back that caused the corruption.
    const field = readFileSync(join(repoRoot, 'packages/ui/src/textField.tsx'), 'utf8');
    expect(field).toContain('defaultValue={value}');
    expect(field).toContain('document.activeElement');
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
    // Chain logos are `logo: 'file.png'`; token marks are keyed by ticker in a plain map, so
    // both shapes are collected — a missing usdt.png is as visible to the user as a missing
    // chain logo, and just as easy to leave behind.
    const logos = [
      ...[...networks.matchAll(/logo: '([^']+)'/gu)].map((match) => match[1]!),
      ...[...networks.matchAll(/^\s{2}[A-Z0-9]+: '([^']+\.png)',/gmu)].map((match) => match[1]!),
    ];
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

    for (const entry of [
      'apps/hardware/index.html',
      'apps/companion-web/index.html',
      'apps/extension/popup.html',
      'apps/extension/tab.html',
    ]) {
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
  it('ships real PNG icons, because Chrome silently ignores everything else', () => {
    /*
     * Reported: the extension appeared in the toolbar with Chrome's grey puzzle piece. The
     * manifest declared `"icons": { "128": "icon.svg" }` — and MV3 does not accept SVG for
     * extension icons. It is not an error, not a warning, and not a broken image: the icon is
     * simply absent, which looks exactly like a build that forgot to include one.
     *
     * So: every icon the manifest names must be a PNG on disk, and the toolbar needs its own
     * `action.default_icon`, which is what the puzzle piece was standing in for.
     */
    const manifestPath = join(repoRoot, 'apps/extension/public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      icons?: Record<string, string>;
      action?: { default_icon?: Record<string, string> };
    };

    const declared = {
      ...(manifest.icons ?? {}),
      ...(manifest.action?.default_icon ?? {}),
    };
    expect(Object.keys(declared).length).toBeGreaterThan(0);
    for (const [size, file] of Object.entries(declared)) {
      expect(file.endsWith('.png'), `${file} must be a PNG`).toBe(true);
      const full = join(repoRoot, 'apps/extension/public', file);
      const bytes = readFileSync(full);
      // The eight-byte PNG signature, so a renamed SVG cannot pass.
      expect([...bytes.subarray(0, 8)], `${file} is not a PNG`).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(bytes.length).toBeGreaterThan(100);
      expect(Number(size), `${size} must be a pixel size`).toBeGreaterThan(0);
    }

    // 16 and 32 are what the toolbar actually draws; without them Chrome falls back.
    expect(manifest.action?.default_icon).toMatchObject({ '16': expect.any(String), '32': expect.any(String) });
  });

  it('gives the browser tabs the same mark', () => {
    // The same complaint one step over: a tab with no favicon is a tab with a blank page icon.
    for (const app of ['companion-web', 'hardware']) {
      const html = readFileSync(join(repoRoot, `apps/${app}/index.html`), 'utf8');
      expect(html, `${app} must link a favicon`).toContain('rel="icon"');
      const icon = readFileSync(join(repoRoot, `apps/${app}/public/favicon.svg`), 'utf8');
      expect(icon).toContain('<svg');
    }
  });

  it('offers a fee choice wherever a transaction is built', () => {
    /*
     * Two screens turn user intent into a signed transaction: the send form, and the approval
     * screen a dApp's request lands on. The approval screen is the one that used to have no
     * price choice at all — a site named a fee and the user paid it, on a contract call that
     * often moves nothing, which makes the fee the entire cost.
     */
    const send = readFileSync(join(repoRoot, 'packages/companion-ui/src/screens/Send.tsx'), 'utf8');
    const sign = readFileSync(join(repoRoot, 'packages/companion-ui/src/screens/Sign.tsx'), 'utf8');

    for (const [name, source] of [
      ['Send.tsx', send],
      ['Sign.tsx', sign],
    ] as const) {
      expect(source, `${name} must render the shared fee selector`).toContain('<FeeSelector');
      expect(source, `${name} must read the chain's prices`).toContain('useFeeTiers(');
    }

    // The approval screen must hand the choice to the request builder, and it must not build
    // one before the chain has answered — a fallback price would be the wallet's own guess
    // wearing the clothes of the market's.
    expect(sign).toContain('fee: fee.fields');
    expect(sign).toMatch(/isTransaction && fee\.fields === null/u);

    // Fee amounts are shown in the chain's own coin, which differs per chain. A hard-coded
    // "BNB or ETH" answer labels Polygon fees as ETH.
    expect(send).toContain('nativeSymbol(settings.chainId)');
    expect(send).not.toMatch(/chainId === 56/u);
  });

  it('keeps the two signing steps apart and the fee out of reach while signing', () => {
    /*
     * Three rules, each one a correction of something that was wrong:
     *
     *   1. The QR (what the device reads) and the camera (what reads the device) are
     *      sequential. Both on screen at once meant a camera pointing at a screen that was
     *      still waiting for the phone.
     *   2. The fee belongs to the confirmation step. Next to a QR it can be changed after the
     *      transaction has been laid out as final — the code on screen and the bytes signed
     *      would then disagree, which the device would (correctly) refuse, after the user had
     *      already approved it on the phone.
     *   3. A request whose price was already chosen — the send form chooses one — is not asked
     *      twice.
     */
    const sign = readFileSync(join(repoRoot, 'packages/companion-ui/src/screens/Sign.tsx'), 'utf8');
    const send = readFileSync(join(repoRoot, 'packages/companion-ui/src/screens/Send.tsx'), 'utf8');

    // Step 2 is behind the button, and the camera runs only there.
    expect(sign).toContain("active: state.step === 'outgoing' && stageNow === 'scan'");
    expect(sign).toContain("onClick={() => setStage('scan')}");
    expect(sign).toContain("stageNow === 'scan' ? (");

    // The confirmation step holds the price and nothing scannable; the code step holds the
    // code and no price to change.
    expect(sign).toContain("stageNow === 'review' && message?.kind === 'tx'");
    expect(sign).toContain("stageNow === 'review' ? null : (");

    // The send form sets the price, and says so, so the signing screen does not ask again.
    expect(send).toContain('feeLocked: true');
    expect(sign).toContain('request.feeLocked !== true');
  });

  it('shows a dollar figure only when there is a real price for it', () => {
    /*
     * The price comes from a third party, so it can fail, and the failure must be silence.
     * A stale or defaulted number next to a fee is worse than no number: "≈ $0.00" on a real
     * transaction reads as free.
     */
    const selector = readFileSync(
      join(repoRoot, 'packages/companion-ui/src/ui/FeeSelector.tsx'),
      'utf8',
    );
    expect(selector).toContain('usdValue(cost, usd?.price ?? null)');
    expect(selector).toMatch(/dollars === null \? '' :/u);

    // Only the coin the fee is paid in is ever looked up, and only on real networks.
    const prices = readFileSync(join(repoRoot, 'packages/companion/src/prices.ts'), 'utf8');
    expect(prices).toContain('api.coingecko.com');
    const lib = readFileSync(join(repoRoot, 'packages/companion-ui/src/lib/prices.ts'), 'utf8');
    expect(lib).toContain('meta.testnet === true');
    expect(lib).toContain('priceableSymbols().includes(meta.symbol)');
  });

  it('says where the fee and its dollar value came from', () => {
    /*
     * Two numbers, two sources, and neither is the wallet's own opinion: the rate is the
     * chain's latest block, the dollar value is a spot price from whichever public API
     * answered. A figure with no provenance is a figure the user has to take on faith, which
     * is the opposite of what this wallet is for.
     */
    const selector = readFileSync(
      join(repoRoot, 'packages/companion-ui/src/ui/FeeSelector.tsx'),
      'utf8',
    );
    // The line names the source that answered, and never claims a price that was not fetched.
    expect(selector).toContain('export function FeeSourceNote(');
    expect(selector).toContain('费率来自 RPC 节点最新区块');
    expect(selector).toContain('${quote.source}');
    expect(selector).toMatch(/if \(!showFiat \|\| quote === null\)/u);

    // Every screen that shows a fee carries the line: the selector, and the read-only form.
    expect(selector).toContain('<FeeSourceNote quote={usd ?? null} showFiat={showFiat} />');
    expect(selector).toContain('<FeeSourceNote quote={quote} showFiat={showFiat} />');
    const sign = readFileSync(join(repoRoot, 'packages/companion-ui/src/screens/Sign.tsx'), 'utf8');
    expect(sign).toContain('<LockedFee');

    // The sources that can answer are a fixed, auditable list, and each one is named in the UI.
    const prices = readFileSync(join(repoRoot, 'packages/companion/src/prices.ts'), 'utf8');
    for (const host of [
      'api.coingecko.com',
      'coins.llama.fi',
      'api.binance.com',
      'api.coinbase.com',
      'api.kraken.com',
      'api.coinpaprika.com',
    ]) {
      expect(prices, `${host} must be one of the price sources`).toContain(host);
    }
    // And the settings say which of them will be tried, in order.
    const settings = readFileSync(
      join(repoRoot, 'packages/companion-ui/src/screens/Settings.tsx'),
      'utf8',
    );
    expect(settings).toContain('priceSourceLabels().join(');
  });

  it('routes every way out of a screen through the router, not around it', () => {
    // The Android back button is handled by the router, which owns the screen stack. A screen
    // that navigates by any other means — a raw history call, a fragment link — would move the
    // screen without telling the stack, and the system back gesture would then go somewhere
    // else entirely. Both were true at some point in this app's life.
    const app = readFileSync(join(repoRoot, 'apps/hardware/src/App.tsx'), 'utf8');
    expect(app).toContain("App.addListener('backButton'");
    expect(app).toContain("window.addEventListener('popstate'");
    // Every up-navigation is the same `back()` the on-screen arrow calls.
    expect(app).not.toMatch(/onBack=\{\(\) => go\(/u);
    expect(app).not.toMatch(/onCancel=\{\(\) => go\(/u);
  });
});
