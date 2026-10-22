import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    pool: 'threads',
    include: [
      'src/lib/**/*.test.ts',
      'netlify/server/**/*.test.ts',
      'tools/migration/lib/safeAreaMatrix/**/*.test.ts',
      'tools/marketing-assets/lib/storeFrames/**/*.test.ts',
      'tools/marketing-assets/lib/page/**/*.test.ts',
      'tools/icons/lib/**/*.test.ts',
      'netlify/securityPolicy.test.ts',
      'tools/release/lib/buildVersion.test.ts',
      'tools/icons/tests/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/**/*.ts',
        'netlify/server/**/*.ts',
        'tools/migration/lib/safeAreaMatrix/**/*.ts',
        'tools/marketing-assets/lib/storeFrames/**/*.ts',
        'tools/marketing-assets/lib/page/**/*.ts',
        'tools/icons/lib/**/*.ts',
        'tools/store-drawings/lib/strokeSettings.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/*TestHarness.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 82.3, branches: 81.8, functions: 85.5, lines: 83.7 },
    },
  },
});
