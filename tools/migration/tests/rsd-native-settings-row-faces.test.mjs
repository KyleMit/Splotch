import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { host, native, resetHost } from './rsd-native-control-host.mjs';
import { html } from 'react-strict-dom';
import * as ReactNative from 'react-native';
import { scale, themes } from '../../../web/src/lib/design/tokens.ts';
import {
  SHIPPING_HUB_ROW_KEEPS_UA_FACE,
  SHIPPING_HUB_TITLE_WEIGHT,
} from './rsd-settings-rows-shipping.mjs';
import { darkTheme } from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import { RsdHubRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdHubRow.tsx';
import { RsdSidebarRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSidebarRow.tsx';

// The Settings rows' type and ink as Android and iOS draw them, through the released native
// renderer with each row's native face and fade in place of the web ones.
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/hubRowFace.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/hubRowFace.native.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/HubTitle.tsx',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/HubTitle.native.tsx')
);
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/HubTileFrame.tsx',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/HubTileFrame.native.tsx')
);
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.native.ts')
);

let root, container, titleColumnWidth;
const measuredWordWidths = new Map();
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetHost();
  measuredWordWidths.clear();
  titleColumnWidth = 0;
  host.layoutOf = (node) => ({
    x: 0,
    y: 0,
    width:
      node.nextElementSibling?.dataset.testid === 'hub-subtitle'
        ? titleColumnWidth
        : (measuredWordWidths.get(node.textContent) ?? 0),
    height: 20,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

// Re-renders in place, as a section change does, rather than mounting afresh.
async function render(element, theme = 'light') {
  await act(async () =>
    root.render(h(html.div, { style: theme === 'dark' ? darkTheme : null }, element))
  );
}

const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const styleOf = (node) => native(node).style;

describe('RsdSidebarRow', () => {
  const row = (active) =>
    h(RsdSidebarRow, { icon: 'sound', label: 'Sound', unseen: false, active, onSelect() {} });
  const labelInk = () => styleOf(byTestId('sidebar-row').querySelector(':scope > span')).color;

  it.each(['light', 'dark'])(
    'paints the %s label ink of a row whose reading position moves in place',
    async (theme) => {
      await render(row(false), theme);
      await render(row(true), theme);
      expect(labelInk()).toBe(themes[theme].brandText);
      await render(row(false), theme);
      expect(labelInk()).toBe(themes[theme].textSoft);
    }
  );
});

const hub = (title, toggle) =>
  h(RsdHubRow, {
    icon: 'sound',
    title,
    subtitle: 'Volume 50%',
    unseen: false,
    toggle,
    onOpen() {},
  });
const hubTitle = () =>
  byTestId('hub-subtitle').previousElementSibling.querySelector(':scope > span');
const wordLayouts = (word) =>
  [...container.querySelectorAll('span')]
    .filter((node) => node.textContent === word && native(node)?.props.onLayout)
    .map((node) => ({ node, deliver: native(node).props.onLayout }));
async function deliverWordWidth(word, width) {
  measuredWordWidths.set(word, width);
  await act(async () => {
    for (const { deliver } of wordLayouts(word))
      deliver({ nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } } });
  });
}

describe('RsdHubRow', () => {
  it('lets native row content and its trailing switch reflow when a whole word cannot fit beside them', async () => {
    await render(
      hub('Appearance', { id: 'zoom-night', label: 'Night Mode', checked: false, onToggle() {} })
    );
    expect(container.querySelector('[aria-label="Night Mode"]')).not.toBeNull();
    expect(styleOf(byTestId('hub-tile')).flexWrap).toBe('wrap');
    expect(styleOf(container.querySelector('button')).flexWrap).toBe('wrap');
  });

  it('leaves the first native title unconstrained until a positive layout arrives', async () => {
    await render(hub('Appearance'));
    expect(styleOf(hubTitle()).width).toBeUndefined();
    expect(hubTitle().textContent).toBe('Appearance');
  });

  it.each([
    ['Appearance', [['Appearance', 93.25]], 93.25],
    ['Sound', [['Sound', 48.5]], 48.5],
    [
      'Tool Drawer',
      [
        ['Tool', 31.75],
        ['Drawer', 52.25],
      ],
      52.25,
    ],
  ])(
    'budgets the measured whole-word width of %s in a squeezed text column',
    async (title, words, widest) => {
      await render(hub(title));
      for (const [word, width] of words) await deliverWordWidth(word, width);
      expect(styleOf(hubTitle()).width).toBe(widest);
      expect(hubTitle().textContent).toBe(title);
      expect(styleOf(hubTitle().parentElement.parentElement)).toMatchObject({
        minWidth: widest,
        flexShrink: 1,
      });
      expect(styleOf(container.querySelector('button'))).toMatchObject({
        minWidth: widest + Number.parseFloat(scale.space4) * 2,
        flexShrink: 1,
      });
      expect(native(byTestId('hub-subtitle')).props.numberOfLines).toBe(2);
    }
  );

  it('shrinks a title word wider than its whole row to fit inside the card', async () => {
    const TILE_PX = 330;
    const ROW_INSET_PX = Number.parseFloat(scale.space4) * 2;
    const measure = host.layoutOf;
    host.layoutOf = (node) =>
      node.firstElementChild?.dataset.testid === 'hub-tile'
        ? { x: 0, y: 0, width: TILE_PX, height: 80 }
        : measure(node);
    await render(hub('Appearance'));
    const size = styleOf(hubTitle()).fontSize;
    await deliverWordWidth('Appearance', 360);
    const room = TILE_PX - ROW_INSET_PX;
    const fitted = room * 0.98;
    expect(styleOf(hubTitle()).fontSize).toBeCloseTo((size * fitted) / 360);
    expect(styleOf(hubTitle()).width).toBeCloseTo(fitted);
    expect(styleOf(container.querySelector('button')).minWidth).toBeCloseTo(fitted + ROW_INSET_PX);
    expect(hubTitle().textContent).toBe('Appearance');
    await deliverWordWidth('Appearance', 200);
    expect(styleOf(hubTitle()).fontSize).toBe(size);
    expect(styleOf(hubTitle()).width).toBe(200);
  });

  it('uses the visible native title face for noninteractive, hidden word measurements', async () => {
    await render(hub('Tool Drawer'));
    await deliverWordWidth('Tool', 31.75);
    await deliverWordWidth('Drawer', 52.25);
    expect(styleOf(hubTitle()).width).toBe(52.25);
    const titleStyle = styleOf(hubTitle());
    const measured = wordLayouts('Drawer')[0].node;
    expect(styleOf(measured)).toMatchObject({
      fontFamily: titleStyle.fontFamily,
      fontWeight: titleStyle.fontWeight,
      fontSize: titleStyle.fontSize,
      position: 'absolute',
    });
    expect(native(measured).props.accessible).toBe(false);
    expect(native(measured.parentElement).props).toMatchObject({
      pointerEvents: 'none',
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(styleOf(measured.parentElement)).toMatchObject({
      width: 402,
      height: 0,
      flexDirection: 'row',
      opacity: 0,
    });
  });

  it('fills the available title column and keeps an explicit whole-word width when it collapses', async () => {
    await render(hub('Appearance'));
    await deliverWordWidth('Appearance', 93.25);
    titleColumnWidth = 144;
    await act(async () =>
      native(hubTitle().parentElement).props.onLayout({
        nativeEvent: { layout: { width: titleColumnWidth } },
      })
    );
    expect(styleOf(hubTitle()).width).toBe(144);
    titleColumnWidth = 0;
    await act(async () =>
      native(hubTitle().parentElement).props.onLayout({
        nativeEvent: { layout: { width: titleColumnWidth } },
      })
    );
    expect(styleOf(hubTitle()).width).toBe(93.25);
  });

  it('replaces measured word widths when the native layout becomes smaller', async () => {
    await render(hub('Tool Drawer'));
    await deliverWordWidth('Tool', 31.75);
    await deliverWordWidth('Drawer', 72.5);
    expect(styleOf(hubTitle()).width).toBe(72.5);
    await deliverWordWidth('Drawer', 45.25);
    expect(styleOf(hubTitle()).width).toBe(45.25);
  });

  it('remounts the measurement nodes when a row receives another title', async () => {
    await render(hub('Appearance'));
    await deliverWordWidth('Appearance', 93.25);
    expect(styleOf(hubTitle()).width).toBe(93.25);
    const staleNode = wordLayouts('Appearance')[0].node.parentElement;
    const stale = wordLayouts('Appearance')[0].deliver;
    await render(hub('Sound'));
    expect(staleNode.isConnected).toBe(false);
    await deliverWordWidth('Sound', 48.5);
    expect(styleOf(hubTitle()).width).toBe(48.5);
    await act(async () =>
      stale({ nativeEvent: { layout: { x: 0, y: 0, width: 140, height: 30 } } })
    );
    expect(styleOf(hubTitle()).width).toBe(48.5);
  });

  it('remounts the measurement nodes when the system font scale changes', async () => {
    let fontScale = 1;
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockImplementation(() => ({
      width: 402,
      height: 874,
      scale: 3,
      fontScale,
    }));
    try {
      await render(hub('Sound'));
      await deliverWordWidth('Sound', 48.5);
      expect(styleOf(hubTitle()).width).toBe(48.5);
      const staleNode = wordLayouts('Sound')[0].node.parentElement;
      const stale = wordLayouts('Sound')[0].deliver;
      fontScale = 2;
      await render(hub('Sound'));
      expect(staleNode.isConnected).toBe(false);
      await deliverWordWidth('Sound', 97);
      expect(styleOf(hubTitle()).width).toBe(97);
      await act(async () =>
        stale({ nativeEvent: { layout: { x: 0, y: 0, width: 48.5, height: 20 } } })
      );
      expect(styleOf(hubTitle()).width).toBe(97);
    } finally {
      dimensions.mockRestore();
    }
  });

  // The face shipping's unreset <button> takes in a WebView: San Francisco on iOS, Roboto on Android.
  it('sets the title and subtitle in the system face, the title at the shipping weight', async () => {
    expect(SHIPPING_HUB_ROW_KEEPS_UA_FACE).toBe(true);
    await render(
      h(RsdHubRow, {
        icon: 'sound',
        title: 'Sound',
        subtitle: 'Volume 50%',
        unseen: false,
        onOpen() {},
      })
    );
    const subtitle = byTestId('hub-subtitle');
    const title = hubTitle();
    expect(title.textContent).toBe('Sound');
    expect(styleOf(title)).toMatchObject({
      fontFamily: 'system-ui',
      fontWeight: scale[SHIPPING_HUB_TITLE_WEIGHT],
    });
    expect(styleOf(subtitle).fontFamily).toBe('system-ui');
    expect(styleOf(subtitle).fontWeight).toBeUndefined();
  });
});
