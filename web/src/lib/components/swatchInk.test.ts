import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ColorControl from './ColorControl.svelte';
import ColorPalette from './ColorPalette.svelte';
import { getRingColor } from '$lib/colorRing';
import { LANDSCAPE_COLORS } from '$lib/landscapeToolbar';
import { appearanceState } from '$lib/state/appearance.svelte';
import {
  BLACK_INK,
  PALETTE_COLORS,
  WHITE_INK,
  colorsState,
  selectCustomSwatch,
  selectPaletteColor,
} from '$lib/state/colors.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import type { ResolvedTheme } from '$lib/theme';

// What a child sees and paints for each swatch, driven through the real
// components and stores the drawing route mounts. Expectations are spelled out
// here rather than derived from the store's own rule, so a change to that rule
// has to change this file too.
const THEMES: readonly ResolvedTheme[] = ['light', 'dark'];
const PURPLE = PALETTE_COLORS[0].hex;

function expectedInk(hex: string, theme: ResolvedTheme): string {
  return theme === 'dark' && hex === BLACK_INK ? WHITE_INK : hex;
}

function switchTheme(theme: ResolvedTheme) {
  settingsState.setTheme(theme);
  flushSync();
  expect(appearanceState.resolvedTheme()).toBe(theme);
}

let mounted: ReturnType<typeof mount> | null = null;

function mountInto(component: typeof ColorPalette | typeof ColorControl) {
  const target = document.createElement('div');
  document.body.append(target);
  mounted =
    component === ColorControl
      ? mount(ColorControl, {
          target,
          props: { open: true, onOpenChange: () => {}, onfold: () => {} },
        })
      : mount(ColorPalette, { target });
  flushSync();
  return target;
}

function paletteSwatch(root: HTMLElement, hex: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`.color-swatch[data-color="${hex}"]`);
  if (!button) throw new Error(`No palette swatch for ${hex}`);
  return button;
}

function menuSwatches(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.color-option:not(.more-colors)')];
}

function tap(button: HTMLButtonElement) {
  button.click();
  flushSync();
}

// The selected Black swatch as it renders now — fill, name, and selection ring
// — alongside the ink it paints. `fill` is the style declaration naming its color.
function expectSelectedBlack(button: HTMLButtonElement, fill: string, theme: ResolvedTheme) {
  const ink = expectedInk(BLACK_INK, theme);
  const style = button.getAttribute('style');
  expect(style).toContain(`${fill}: ${ink};`);
  expect(style).toContain(getRingColor(ink));
  expect(button.getAttribute('aria-label')).toBe(ink === WHITE_INK ? 'White' : 'Black');
  expect(colorsState.activeSwatch).toBe(BLACK_INK);
  expect(colorsState.activeColor).toBe(ink);
}

beforeEach(() => {
  switchTheme('light');
  selectPaletteColor(PURPLE);
  flushSync();
});

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  settingsState.setTheme('system');
  flushSync();
});

describe('palette swatch ink', () => {
  it.each(THEMES)('shows and paints each swatch in its %s ink', (theme) => {
    switchTheme(theme);
    const root = mountInto(ColorPalette);

    for (const { hex, label } of PALETTE_COLORS) {
      const swatch = paletteSwatch(root, hex);
      const ink = expectedInk(hex, theme);
      expect(swatch.getAttribute('style'), hex).toContain(`background-color: ${ink};`);
      expect(swatch.getAttribute('aria-label'), hex).toBe(ink === WHITE_INK ? 'White' : label);

      tap(swatch);
      expect(colorsState.activeSwatch, hex).toBe(hex);
      expect(colorsState.activeColor, hex).toBe(ink);
    }
  });
});

describe('color menu swatch ink', () => {
  it('carries the Black swatch', () => {
    expect(LANDSCAPE_COLORS.map(({ hex }) => hex)).toContain(BLACK_INK);
  });

  it.each(THEMES)('shows and paints each swatch in its %s ink', (theme) => {
    switchTheme(theme);
    const buttons = menuSwatches(mountInto(ColorControl));
    expect(buttons).toHaveLength(LANDSCAPE_COLORS.length);

    LANDSCAPE_COLORS.forEach(({ hex, label }, i) => {
      const ink = expectedInk(hex, theme);
      expect(buttons[i].getAttribute('style'), hex).toContain(`background: ${ink};`);
      expect(buttons[i].getAttribute('aria-label'), hex).toBe(ink === WHITE_INK ? 'White' : label);

      tap(buttons[i]);
      expect(colorsState.activeSwatch, hex).toBe(hex);
      expect(colorsState.activeColor, hex).toBe(ink);
    });
  });
});

describe('ink across a theme switch mid-session', () => {
  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)('selected Black chosen in %s follows a switch to %s and back', (from, to) => {
    switchTheme(from);
    const black = paletteSwatch(mountInto(ColorPalette), BLACK_INK);
    tap(black);
    expectSelectedBlack(black, 'background-color', from);

    switchTheme(to);
    expectSelectedBlack(black, 'background-color', to);

    switchTheme(from);
    expectSelectedBlack(black, 'background-color', from);
  });

  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)(
    'Black picked from the color menu in %s follows a switch to %s and back',
    (from, to) => {
      switchTheme(from);
      const black = menuSwatches(mountInto(ColorControl))[
        LANDSCAPE_COLORS.findIndex(({ hex }) => hex === BLACK_INK)
      ];
      tap(black);
      expectSelectedBlack(black, 'background', from);

      switchTheme(to);
      expectSelectedBlack(black, 'background', to);

      switchTheme(from);
      expectSelectedBlack(black, 'background', from);
    }
  );

  it('every other swatch keeps its fill and ink through a switch', () => {
    const root = mountInto(ColorPalette);
    for (const { hex } of PALETTE_COLORS.filter(({ hex }) => hex !== BLACK_INK)) {
      switchTheme('light');
      tap(paletteSwatch(root, hex));
      switchTheme('dark');
      expect(paletteSwatch(root, hex).getAttribute('style'), hex).toContain(
        `background-color: ${hex};`
      );
      expect(colorsState.activeColor, hex).toBe(hex);
    }
  });

  // Today's behavior, pinned so a refactor cannot change it silently: the
  // custom swatch chosen before any color is picked keeps drawing with the ink
  // it inherited, even after the theme that produced that ink has gone.
  it('keeps the ink the custom swatch inherited before any color was picked', () => {
    switchTheme('dark');
    tap(paletteSwatch(mountInto(ColorPalette), BLACK_INK));
    selectCustomSwatch();

    switchTheme('light');
    expect(colorsState.customColorSelected).toBe(false);
    expect(colorsState.activeColor).toBe(WHITE_INK);
  });
});
