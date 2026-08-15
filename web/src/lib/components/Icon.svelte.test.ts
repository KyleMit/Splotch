import { describe, it, expect } from 'vitest';
import { COLOR_ICONS } from './Icon.svelte';
import { iconNameFromPath } from './iconTypes';
import type { CommonIconName } from './iconTypes';
import { isSpot, paintedValues } from '../../../../tools/icons/lib/icon-chroma.mjs';
import { themes } from '../design/tokens';

// Guards the hand-maintained COLOR_ICONS allowlist (Icon.svelte) against a
// forgotten full-color icon: every icon whose raw SVG paints a saturated hue
// must be tagged, or it renders wrongly tinted by the monochrome fill filter.
// COLOR_ICONS is an allowed superset — it also holds monochrome opt-outs (the
// stroke-size previews that tint via currentColor / theme vars), so the
// inclusion is one-directional: {colorful} ⊆ COLOR_ICONS.
//
// Mirror Icon.svelte's own glob so the guard covers exactly the icons the app
// can render through <Icon>. The exclusions repeat NON_RENDERABLE_ICONS from
// iconTypes.ts — that list is authoritative, but Vite resolves import.meta.glob
// statically, so the patterns can't be built from it.
const svgs = import.meta.glob<string>(['../icons/*.svg', '!../icons/splotchy.svg'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('COLOR_ICONS allowlist', () => {
  const colorful = new Set(
    Object.entries(svgs)
      .filter(([, src]) => isSpot(src))
      .map(([path]) => iconNameFromPath(path))
  );

  it('flags at least the known spot icons (classifier sanity check)', () => {
    expect(colorful.has('camera')).toBe(true);
    expect(colorful.size).toBeGreaterThan(5);
  });

  it.each(Object.keys(svgs).map(iconNameFromPath).sort())(
    '%s: if colorful, it opts out of the monochrome tint',
    (name) => {
      if (!colorful.has(name)) return;
      expect(
        COLOR_ICONS.has(name as CommonIconName),
        `${name} paints a saturated hue but is missing from COLOR_ICONS`
      ).toBe(true);
    }
  );
});

describe('monochrome icon fill', () => {
  // Every icon outside COLOR_ICONS renders through the app's monochrome tint
  // filter, which assumes the SVG bakes this exact ink — a different fill
  // (a fresh export using `#000`, say) would pass the filter untinted and
  // render subtly off. Locked from the values actually painted at HEAD.
  const ALLOWED_PAINTS: readonly string[] = [themes.light.iconInk];

  // These bake no fill/stroke at all (github and phone-tablet only a fill-rule)
  // — they inherit their color from the <svg> wrapper they're rendered into, so
  // they have nothing for this guard to check. For the two beta tab marks that
  // is the point rather than an accident: SegmentedPicker's underline tabs paint
  // them with `fill: currentColor` so the mark takes the live tab's ink, which a
  // baked fill on the path would override.
  const NO_PAINT_EXCEPTIONS = new Set(['github', 'android', 'phone-tablet']);

  const monochrome = Object.keys(svgs)
    .map(iconNameFromPath)
    .filter((name) => !COLOR_ICONS.has(name as CommonIconName))
    .sort();
  const unpainted = monochrome.filter((name) => NO_PAINT_EXCEPTIONS.has(name));
  const painted = monochrome.filter((name) => !NO_PAINT_EXCEPTIONS.has(name));

  const inkOf = (name: string) =>
    paintedValues(svgs[`../icons/${name}.svg`]).filter(
      ({ attr }) => attr === 'fill' || attr === 'stroke'
    );

  // Both lists below are parametrized from this split, so an exception naming an icon that no
  // longer ships would silently empty one of them instead of failing.
  it('exempts only icons that are still in the monochrome set', () => {
    expect(unpainted).toEqual([...NO_PAINT_EXCEPTIONS].sort());
  });

  it.each(unpainted)('%s: bakes no ink, leaving it to the live tab', (name) => {
    expect(inkOf(name)).toHaveLength(0);
  });

  it.each(painted)('%s: paints only the shared monochrome ink', (name) => {
    const paints = inkOf(name);
    expect(
      paints.length,
      `${name} bakes no fill/stroke — this guard can't verify its ink`
    ).toBeGreaterThan(0);
    for (const { attr, value } of paints) {
      expect(
        ALLOWED_PAINTS,
        `${name} ${attr}="${value}" is outside the monochrome palette`
      ).toContain(value.toLowerCase());
    }
  });
});
