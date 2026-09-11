import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * HTTPS is optional and env-gated, for the same reason as the companion: the entropy
 * capture needs `getUserMedia`, which browsers only grant in a secure context.
 * `localhost` qualifies; a bare LAN IP does not.
 */
function httpsConfig(): { key: Buffer; cert: Buffer } | undefined {
  const keyPath = process.env.NP_HTTPS_KEY;
  const certPath = process.env.NP_HTTPS_CERT;
  if (!keyPath || !certPath) return undefined;
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

export default defineConfig({
  plugins: [react()],
  // Capacitor loads the bundle from the filesystem, so all paths must be relative.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: Number(process.env.NP_PORT ?? 5173),
    strictPort: true,
    ...(httpsConfig() ? { https: httpsConfig() } : {}),
  },
});
