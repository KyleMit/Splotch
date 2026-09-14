// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { COLORING_PACK_CACHE_FAMILY_PREFIX } from '$lib/coloringPacks/cacheKeys';

// boot/coloringPacks.ts keeps its own copy of the pack cache family prefix:
// importing cacheKeys.ts would put it on the startup modulepreload list, which
// tests/startup-bundle.spec.ts forbids. This is the drift guard for that copy.
it('the startup-path copy of the pack cache family prefix matches cacheKeys.ts', () => {
  const source = readFileSync(new URL('./coloringPacks.ts', import.meta.url), 'utf8');
  const literal = /const PACK_CACHE_FAMILY_PREFIX = '([^']+)';/.exec(source)?.[1];
  expect(literal, 'PACK_CACHE_FAMILY_PREFIX not found — update this drift guard').toBe(
    COLORING_PACK_CACHE_FAMILY_PREFIX
  );
});
