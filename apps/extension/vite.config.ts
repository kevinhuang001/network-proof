import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Build 1 of 3: the extension's own UI pages (popup + full-page tab).
 *
 * Three separate builds are required by Manifest V3 rather than by preference:
 *  - the UI pages are normal ES modules loaded from HTML;
 *  - the service worker must be a single self-contained module file;
 *  - content scripts cannot be ES modules at all, so they are built as IIFEs.
 *
 * Each build runs with `emptyOutDir: false` after the first, so `dist/` ends up
 * with all four entry points and public/ copied verbatim.
 */
/**
 * A stamp of what was built, shown in settings.
 *
 * Added because a whole round of debugging was spent on a question nobody could answer from the
 * outside: 「现在还是识别不了」 does not say whether the phone is running the build that fixed the
 * previous problem. The commit and the time are baked in at build time, so the settings screen
 * answers it in one glance.
 */
function buildStamp(): string {
  const commit = process.env.NP_BUILD_COMMIT ?? 'unknown';
  const at = process.env.NP_BUILD_TIME ?? new Date().toISOString();
  return `${commit} · ${at}`;
}

export default defineConfig({
  define: {
    __NP_BUILD__: JSON.stringify(buildStamp()),
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome67',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        tab: resolve(__dirname, 'tab.html'),
      },
    },
  },
});
