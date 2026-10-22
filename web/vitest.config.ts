import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    pool: 'threads',
    include: ['src/**/*.test.ts', '*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/*TestHarness.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 82.3, branches: 81.8, functions: 85.5, lines: 83.7 },
    },
  },
});
