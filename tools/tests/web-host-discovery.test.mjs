import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const knip = JSON.parse(readFileSync(join(repoRoot, 'knip.json'), 'utf8')).workspaces['.'];

it('registers scoped web host TypeScript/TSX/Svelte type-checking after the Kit precheck', () => {
  expect(manifest.scripts.precheck).toContain('node tools/run-web-tool.mjs svelte-kit sync');
  expect(manifest.scripts.check.split(' && ')).toEqual(
    expect.arrayContaining([
      'tsc --project migration/probes/web-host/tsconfig.json --noEmit',
      'node tools/run-web-tool.mjs svelte-check --tsconfig ../migration/probes/web-host/tsconfig.json --fail-on-warnings',
    ])
  );
  const config = JSON.parse(
    readFileSync(join(repoRoot, 'migration/probes/web-host/tsconfig.json'), 'utf8')
  );
  expect(config.extends).toBe('../../../web/tsconfig.json');
  expect(config.compilerOptions.jsx).toBe('react-jsx');
  expect(config.include).toEqual(
    expect.arrayContaining([
      './host/**/*.ts',
      './src/**/*.ts',
      './src/**/*.tsx',
      './src/**/*.svelte',
      './playwright.config.ts',
      './tests/**/*.ts',
    ])
  );
});

it('keeps the retained build and browser entries inside root Knip coverage', () => {
  expect(knip.entry).toEqual(
    expect.arrayContaining([
      'migration/probes/web-host/host/vite.config.ts',
      'migration/probes/web-host/host/compileChrome.ts',
      'migration/probes/web-host/host/renderChrome.ts',
      'migration/probes/web-host/src/ProbeIsland.svelte',
      'migration/probes/web-host/playwright.config.ts',
      'migration/probes/web-host/tests/**/*.spec.ts',
    ])
  );
  expect(knip.project).toEqual(
    expect.arrayContaining([
      'migration/probes/web-host/**/*.ts',
      'migration/probes/web-host/src/**/*.{tsx,svelte}',
    ])
  );
});
