import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Build 2 of 3: the background service worker.
 *
 * One self-contained ESM file, because a Manifest V3 service worker is stopped and
 * restarted at Chrome's discretion: fewer files means fewer ways for a wake-up to
 * go wrong. `inlineDynamicImports` guarantees no code-split chunks.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome67',
    lib: {
      entry: resolve(__dirname, 'src/background/index.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
