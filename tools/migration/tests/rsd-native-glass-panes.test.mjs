import { describe, expect, it, vi } from 'vitest';
import { host, records } from './rsd-native-selection-host.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { GLASS_PANE_INKS } from '../../../experiments/native-architecture/src/rsdDrawing/glassPaneInk.ts';
import { CORNER_BUTTON_SIZE_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { EDGE_INSET_PX } from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';

const FORWARD_REF = Symbol.for('react.forward_ref');

// The React Native props a stand-in host element was rendered with.
function nativeProps(element) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
  const owner = key ? element[key].return : null;
  return owner?.type?.$$typeof === FORWARD_REF ? owner.memoizedProps : {};
}

const panes = () => [...host.querySelectorAll('[data-testid="rsd-glass-pane"]')];

async function mountFlat(width, height) {
  records.dimensions = { width, height, scale: 1, fontScale: 1 };
  storedSettings({ toolbarStyle: 'bare', aiEnabled: true });
  await mountToolbar(toolbarScreen());
  await vi.waitFor(() => expect(panes().length).toBeGreaterThan(0));
}

// What makes Android draw a view, and everything under it, into an offscreen layer every frame.
function layered(style) {
  return {
    opacity: style.opacity ?? 1,
    mixBlendMode: style.mixBlendMode ?? 'normal',
    filter: style.filter ?? [],
    transform: style.transform ?? [],
  };
}
const PLAIN = { opacity: 1, mixBlendMode: 'normal', filter: [], transform: [] };

describe('the native flat glass panes', () => {
  // Negative control: a pane, or a view between the panes and the layout, given an opacity or a
  // blend mode fails here.
  it.each([
    ['portrait', 390, 844],
    ['landscape', 1180, 820],
  ])('fade the %s ink with plain, unblended views', async (_, width, height) => {
    await mountFlat(width, height);
    const layout = host.querySelector('[data-testid="rsd-drawing-layout"]');
    for (const pane of panes()) {
      const props = nativeProps(pane);
      const style = flat(props.style);
      expect(props.pointerEvents).toBe('none');
      expect(style.position).toBe('absolute');
      expect(layered(style)).toEqual(PLAIN);
      expect(style.backgroundColor ?? style.experimental_backgroundImage).toContain(
        `rgb(${GLASS_PANE_INKS.light.rgb} / `
      );
      for (let view = pane.parentElement; view && view !== layout; view = view.parentElement)
        expect(layered(flat(nativeProps(view).style) ?? {})).toEqual(PLAIN);
    }
  });

  // Shipping's geometry runs from the layout's corner, over the bar; the paper area holding the
  // panes starts below it. Negative control: tiles left in layout coordinates sit a bar's height
  // low, and the Settings corner's solid glass falls off the screen.
  it('lay the full ink solid over the drawer toggle and the Settings button', async () => {
    await mountFlat(390, 844);
    const solid = `rgb(${GLASS_PANE_INKS.light.rgb} / ${GLASS_PANE_INKS.light.alpha})`;
    const corner = CORNER_BUTTON_SIZE_PX / 2;
    const below = 844 - EDGE_INSET_PX - corner / 2;
    for (const [x, y] of [
      [EDGE_INSET_PX + corner, below],
      [390 - EDGE_INSET_PX - corner / 2, below],
    ]) {
      const covering = panes()
        .map((pane) => flat(nativeProps(pane).style))
        .filter(
          ({ left, top, width, height }) =>
            x >= left && x < left + width && y >= top && y < top + height
        );
      expect(
        covering.map((style) => style.backgroundColor),
        `${x},${y}`
      ).toEqual([solid]);
    }
  });

  // React Native's parser reads the token after a lone radial size as a second size, so
  // `circle 90px at …` loses its position and the fade centers in the tile. Negative control: the
  // circle form fails here.
  it('give every round fade two radii before its center', async () => {
    await mountFlat(390, 844);
    const radial = panes()
      .map((pane) => flat(nativeProps(pane).style).experimental_backgroundImage)
      .filter((image) => image?.startsWith('radial-gradient('));
    expect(radial.length).toBeGreaterThan(0);
    for (const image of radial)
      expect(image).toMatch(/^radial-gradient\(ellipse ([\d.]+)px \1px at [\d.]+px [\d.]+px, /);
  });

  it('paint the night paper’s ink in Dark mode', async () => {
    records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
    storedSettings({ toolbarStyle: 'bare', aiEnabled: true, appearance: 'dark' });
    await mountToolbar(toolbarScreen(), { appearance: 'dark' });
    await vi.waitFor(() => expect(panes().length).toBeGreaterThan(0));
    for (const pane of panes()) {
      const style = flat(nativeProps(pane).style);
      expect(style.backgroundColor ?? style.experimental_backgroundImage).toContain(
        `rgb(${GLASS_PANE_INKS.dark.rgb} / `
      );
    }
  });
});
