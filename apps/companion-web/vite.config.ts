import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * HTTPS is optional and env-gated.
 *
 * The companion needs the camera, and browsers only grant `getUserMedia` in a secure
 * context: `localhost` qualifies, a bare LAN IP does not. So when the page is opened
 * from another machine — the common case, since the camera is on the laptop while the
 * dev server runs in a container — point NP_HTTPS_KEY / NP_HTTPS_CERT at a
 * self-signed certificate and this serves HTTPS instead.
 *
 * The certificate is self-signed, so the browser shows a warning once. After
 * accepting it the origin *is* a secure context and the camera works.
 */
function httpsConfig(): { key: Buffer; cert: Buffer } | undefined {
  const keyPath = process.env.NP_HTTPS_KEY;
  const certPath = process.env.NP_HTTPS_CERT;
  if (!keyPath || !certPath) return undefined;
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

export default defineConfig({
  plugins: [react()],
  // Served as a plain static site, so assets must be relative.
  base: './',
  // Build floor: Chrome/WebView 67 — the oldest version with BigInt, which the wallet's
  // arithmetic needs and no polyfill can provide. See apps/hardware/public/compat.js.
  build: { outDir: 'dist', target: 'chrome67' },
  server: {
    host: true,
    port: Number(process.env.NP_PORT ?? 5174),
    strictPort: true,
    ...(httpsConfig() ? { https: httpsConfig() } : {}),
  },
});
