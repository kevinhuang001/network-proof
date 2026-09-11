import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Synthetic pixel generation in JS dominates the runtime of the realistic
    // entropy tests; the extractor itself is measured in milliseconds.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
    },
  },
});
