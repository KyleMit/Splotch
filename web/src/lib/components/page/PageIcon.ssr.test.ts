// @vitest-environment node
import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import type { ComponentProps } from 'svelte';
import { describe, expect, expectTypeOf, it } from 'vitest';
import NativePageIcon from './NativePageIcon.svelte';
import WebPageIcon, { PAGE_ICON_MARKUP } from './WebPageIcon.svelte';

const NAMES = ['chevron-left', 'external'] as const;

it('closes both page providers over the same two canonical glyphs', () => {
  expect(Object.keys(PAGE_ICON_MARKUP).sort()).toEqual([...NAMES].sort());
  expectTypeOf<ComponentProps<typeof NativePageIcon>['name']>().toEqualTypeOf<
    (typeof NAMES)[number]
  >();
  expectTypeOf<ComponentProps<typeof WebPageIcon>['name']>().toEqualTypeOf<
    (typeof NAMES)[number]
  >();
});

describe.each([
  ['web', WebPageIcon],
  ['native', NativePageIcon],
] as const)('%s page icons', (_target, component) => {
  it.each(NAMES)('renders %s with its canonical SVG and caller attributes', (name) => {
    const { document } = new Window();
    document.body.innerHTML = render(component, {
      props: { name, class: 'caller-glyph', 'aria-hidden': 'true' },
    }).body;
    const actual = document.querySelector(`[data-icon="${name}"]`);
    expect(actual?.classList.contains('caller-glyph')).toBe(true);
    expect(actual?.getAttribute('aria-hidden')).toBe('true');
    const canonical = document.createElement('div');
    canonical.innerHTML = PAGE_ICON_MARKUP[name];
    expect(actual?.querySelector('svg')?.outerHTML).toBe(canonical.querySelector('svg')?.outerHTML);
  });
});
