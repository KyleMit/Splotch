// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUICKSAND_FONT_FAMILY } from './fonts';

// QUICKSAND_FONT_FAMILY must exactly match the font-family @fontsource-variable/quicksand
// registers in its @font-face rules (routes/+layout.svelte imports that CSS for the side
// effect, then loads this family by name); a package bump that renames the family would
// otherwise silently fall through to the system sans-serif with no test catching it.
const quicksandCssPath = fileURLToPath(
  import.meta.resolve('@fontsource-variable/quicksand/index.css')
);
const quicksandCss = readFileSync(quicksandCssPath, 'utf8');

describe('QUICKSAND_FONT_FAMILY', () => {
  it('matches the family registered by @fontsource-variable/quicksand', () => {
    expect(quicksandCss).toContain(`font-family: '${QUICKSAND_FONT_FAMILY}'`);
  });
});
