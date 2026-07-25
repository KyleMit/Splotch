import { describe, it, expect } from 'vitest';
import { mount, unmount } from 'svelte';
import Icon, { COLOR_ICONS } from './Icon.svelte';
import type { CommonIconName } from './iconTypes';
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
        COLOR_ICONS.has(name as CommonIconName),
        `${name} paints a saturated hue but is missing from COLOR_ICONS`
      ).toBe(true);
    }
  );
});

// The span composes its class from the caller's `class` plus the conditional
// `icon-color` opt-out, so a regression is silent in the markup but visible on
// screen (ActionsPanel's monochrome tint filter keys off `icon-color`).
describe('rendered class', () => {
  const renderedClass = (props: { name: CommonIconName; class?: string }) => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const app = mount(Icon, { target, props });
    const value = target.querySelector('span')?.getAttribute('class') ?? '';
    unmount(app);
    target.remove();
    return value.split(' ').filter((token) => !token.startsWith('svelte-'));
  };

  it('tags a color icon with icon-color alongside the caller class', () => {
    expect(renderedClass({ name: 'camera', class: 'action-icon' })).toEqual([
      'action-icon',
      'icon-color',
    ]);
  });

  it('leaves a mono icon untagged', () => {
    expect(renderedClass({ name: 'chevron-left', class: 'action-icon' })).toEqual(['action-icon']);
  });

  it('emits no placeholder token when no class is passed', () => {
    expect(renderedClass({ name: 'chevron-left' })).toEqual([]);
    expect(renderedClass({ name: 'camera' })).toEqual(['icon-color']);
  });
});
