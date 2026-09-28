// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { BREAKPOINT_EPSILON_PX, TABLET_MIN_SIDE_PX } from '../breakpoints';

it.each(['./InstallBanner.svelte', '../../routes/+page.svelte'])(
  '%s uses the Share-copy device boundary for its portrait layout',
  (path) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(source).toContain(
      `@media (max-width: ${TABLET_MIN_SIDE_PX - BREAKPOINT_EPSILON_PX}px) and (orientation: portrait)`
    );
  }
);
