import { describe, it, expect } from 'vitest';
import { COLOR_ICONS } from './Icon.svelte';
import { isSpot } from '../../../../scripts/lib/iconChroma.mjs';

// Guards the hand-maintained COLOR_ICONS allowlist (Icon.svelte) against a
// forgotten full-color icon: every icon whose raw SVG paints a saturated hue
// must be tagged, or it renders wrongly tinted by the monochrome fill filter.
// COLOR_ICONS is an allowed superset — it also holds monochrome opt-outs (the
// stroke-size previews that tint via currentColor / theme vars), so the
// inclusion is one-directional: {colorful} ⊆ COLOR_ICONS.
//
// Mirror Icon.svelte's own glob (splotchy is excluded there too) so the guard
// covers exactly the icons the app can render through <Icon>.
const svgs = import.meta.glob<string>(['../icons/*.svg', '!../icons/splotchy.svg'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const iconName = (path: string) => (path.split('/').pop() ?? '').replace('.svg', '');

describe('COLOR_ICONS allowlist', () => {
  const colorful = Object.entries(svgs)
    .filter(([, src]) => isSpot(src))
    .map(([path]) => iconName(path));

  it('flags at least the known spot icons (classifier sanity check)', () => {
    expect(colorful).toContain('camera');
    expect(colorful.length).toBeGreaterThan(5);
  });

  it.each(Object.keys(svgs).map(iconName).sort())(
    '%s: if colorful, it opts out of the monochrome tint',
    (name) => {
      if (!isSpot(svgs[`../icons/${name}.svg`])) return;
      expect(
        COLOR_ICONS.has(name),
        `${name} paints a saturated hue but is missing from COLOR_ICONS`
      ).toBe(true);
    }
  );
});
