import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Build 3 of 3: content scripts.
 *
 * `inject.js` runs in the page's MAIN world (declared in the manifest), so it can
 * define `window.ethereum` without fighting the page's Content-Security-Policy.
 * `bridge.js` runs in the isolated world and relays messages between the page and
 * the service worker.
 *
 * Both must be classic scripts — Manifest V3 does not allow content scripts to be
 * ES modules — and Rollup refuses to emit more than one IIFE per build, so the
 * entry is selected by `--mode`. The npm script runs this config twice.
 */
export default defineConfig(({ mode }) => {
  const isBridge = mode === 'bridge';
  return {
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'es2022',
      lib: {
        entry: resolve(__dirname, isBridge ? 'src/content/bridge.ts' : 'src/content/inject.ts'),
        formats: ['iife'],
        name: 'NetProofContent',
        fileName: () => `${isBridge ? 'bridge' : 'inject'}.js`,
      },
      rollupOptions: {
        // No shared chunks: the manifest names these files directly.
        output: { inlineDynamicImports: true },
        preserveEntrySignatures: false,
      },
    },
  };
});
