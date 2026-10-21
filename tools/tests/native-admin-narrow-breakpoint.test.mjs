import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { BREAKPOINT_EPSILON_PX, NARROW_PHONE_MIN_WIDTH_PX } from '../../web/src/lib/breakpoints.ts';
import { ROOT } from '../lib/proc.mjs';

const ADMIN_CHROME = join(
  ROOT,
  'experiments/native-architecture/src/pageDocument/admin/adminChrome.tsx'
);

// The admin console's masthead drops its crayon strip where shipping's PageShell does; its media
// query is a literal because React Strict DOM compiles style keys statically.
it("drops the admin masthead's crayon strip at shipping's narrow-phone breakpoint", () => {
  const source = readFileSync(ADMIN_CHROME, 'utf8');
  const narrow = /const NARROW = '@media \(max-width: ([\d.]+)px\)';/.exec(source);
  expect(Number(narrow?.[1])).toBe(NARROW_PHONE_MIN_WIDTH_PX - BREAKPOINT_EPSILON_PX);
  expect(source).toMatch(/crayons: \{\n\s+display: \{ default: 'flex', \[NARROW\]: 'none' \},/);
});
