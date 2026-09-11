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
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        tab: resolve(__dirname, 'tab.html'),
      },
    },
  },
});
