import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Storage keys are boundary strings: declared once in STORAGE_KEYS, reached
// only through the storage seam. A module that calls localStorage directly is
// invisible to hydrationKeys and to anything reasoning about what Splotch
// persists on a device, and it re-implements the seam's degrade behaviour by
// hand. web/src/app.html is the documented bundle-boundary exception and is not
// a module, so it falls outside this scan by construction.
const SEAM = 'web/src/lib/storage.ts';
const ACCESSOR = /\blocalStorage\s*\.\s*(getItem|setItem|removeItem|clear|key)\b/;

describe('storage seam', () => {
  it('is the only module reaching localStorage', () => {
    const root = join(import.meta.dirname, '..', '..');
    const files = globSync('web/src/**/*.{ts,svelte}', { cwd: root }).filter(
      (file) => file !== SEAM && !file.endsWith('.test.ts')
    );
    // A pattern that matched nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(100);

    const offenders = files.filter((file) => ACCESSOR.test(readFileSync(join(root, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
