import { describe, it, expect } from 'vitest';
import { COLOR_ICONS, SELF_TINTING_ICON_NAMES } from './Icon.svelte';
import { COLORFUL_ICONS } from './icon-meta';
import type { CommonIconName } from './iconTypes';
import { iconNameFromPath } from './iconTypes';
import { isSpot, paintedValues } from '../../../../tools/icons/lib/icon-chroma.mjs';
import { themes } from '../design/tokens';

// Guards the two halves of Icon.svelte's `icon-color` opt-out set. COLORFUL_ICONS
// is generated from the SVGs by gen:icon-names, so the committed module must
// equal what the classifier says about the SVGs on disk (a recolored existing
// icon changes the classification without touching the type union). The
// SELF_TINTING hand list is the complement: monochrome icons that opt out for
// their own reasons, so anything the classifier already flags has no business
// there — that inclusion used to be one-directional and is now exact.
//
// Mirror Icon.svelte's own glob plus the deferred directory (ADR-0164) so the
// guard covers exactly the icons the app can render through <Icon>. The
// exclusions repeat NON_RENDERABLE_ICONS from iconTypes.ts — that list is
// authoritative, but Vite resolves import.meta.glob statically, so the
// patterns can't be built from it.
const svgs = import.meta.glob<string>(
  ['../icons/*.svg', '../icons/deferred/*.svg', '!../icons/splotchy.svg'],
  {
    eager: true,
    query: '?raw',
    import: 'default',
  }
);
const svgByName = Object.fromEntries(
  Object.entries(svgs).map(([path, src]) => [iconNameFromPath(path), src])
);

describe('icon-color opt-out set', () => {
  const colorful = Object.entries(svgs)
    .filter(([, src]) => isSpot(src))
    .map(([path]) => iconNameFromPath(path))
    .sort();

  it('flags at least the known spot icons (classifier sanity check)', () => {
    expect(colorful).toContain('camera');
    expect(colorful.length).toBeGreaterThan(5);
  });

  it('the generated COLORFUL_ICONS module is fresh (rerun npm run gen:icon-names)', () => {
    expect([...COLORFUL_ICONS]).toEqual(colorful);
  });

  it('the self-tinting hand list holds only icons the classifier calls monochrome', () => {
    const misfiled = SELF_TINTING_ICON_NAMES.filter((name) => colorful.includes(name));
    expect(misfiled, 'already generated into COLORFUL_ICONS; drop from the hand list').toEqual([]);
  });

  it('every listed name is a shipped icon', () => {
    const missing = [...COLOR_ICONS].filter((name) => !(name in svgByName));
    expect(missing).toEqual([]);
  });
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
    paintedValues(svgByName[name]).filter(({ attr }) => attr === 'fill' || attr === 'stroke');

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
