import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The reduced-motion query is a boundary string: one spelling, imported
// everywhere. A typo in a hand-written copy — `reduce-motion`, `reduced-motion`
// — evaluates to false and silently disables the accommodation on that surface
// alone. CSS `@media (prefers-reduced-motion: reduce)` blocks are a different
// language with its own failure mode (an unknown feature is a parse error, not
// a silent false), so only script is scanned here.
const HOME = 'web/src/lib/platform/reducedMotion.ts';
const LITERAL = /prefers-reduced-motion/;

// Everything before the first <style> block, which is where a component's
// script lives. A .ts file is script throughout.
function scriptOf(file, source) {
  if (!file.endsWith('.svelte')) return source;
  const style = source.indexOf('<style');
  return style === -1 ? source : source.slice(0, style);
}

describe('reduced-motion query', () => {
  it('is spelled once for every script that consults it', () => {
    const root = join(import.meta.dirname, '..', '..');
    const files = globSync('web/src/**/*.{ts,svelte}', { cwd: root }).filter(
      (file) => file !== HOME && !file.endsWith('.test.ts')
    );
    // A pattern that matched nothing would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(100);

    const offenders = files.filter((file) =>
      LITERAL.test(scriptOf(file, readFileSync(join(root, file), 'utf8')))
    );

    expect(offenders).toEqual([]);
  });
});
