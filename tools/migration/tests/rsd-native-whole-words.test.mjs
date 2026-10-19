import { act, createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { host, native, resetHost } from './rsd-native-control-host.mjs';
import * as ReactNative from 'react-native';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import {
  PICKER_METRICS,
  RsdSegmentedPicker,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdSegmentedPicker.tsx';
import { RsdColoringTile } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringTile.tsx';
import { RsdSidebarRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSidebarRow.tsx';
import { RsdToggleRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdToggleRow.tsx';
import { RsdSliderRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSlider.tsx';
import { TextZoomRevision } from '../../../experiments/native-architecture/src/platform/textZoomRevision.ts';
import { scale, themes } from '../../../web/src/lib/design/tokens.ts';
import {
  COVER_CAPTION_HEIGHT_PX,
  TILE_ART_INSET_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/coloringGrid.ts';

// Labels and captions as Android and iOS lay them out at a large OS font: the native text adapter
// reports a word its layout broke, and the test plays the native layout's part.
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/WholeWordText.tsx',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/WholeWordText.native.tsx')
);
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.native.ts')
);
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/pickerPlatform.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/pickerPlatform.native.ts')
);

const INSET_PX = Number.parseFloat(scale.space1);
const ROW_CELL_PX = 100;
const STACKED_CELL_PX = 300;
const OPTION_HEIGHT_PX = 48;
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'theme-light' },
  { value: 'dark', label: 'Dark', icon: 'theme-dark' },
  { value: 'system', label: 'System', icon: 'theme-auto' },
];

let root, container, selections, fontScale;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetHost();
  fontScale = 3.571;
  vi.spyOn(ReactNative, 'useWindowDimensions').mockImplementation(() => ({
    width: host.windowWidth,
    height: 874,
    scale: 3,
    fontScale,
  }));
  host.layoutOf = cellLayout;
  selections = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

// Option cells side by side in a row track, or each across the track when it stacks.
function cellLayout(node) {
  const cells = [...(node.parentElement?.children ?? [])].filter((child) =>
    child.querySelector(':scope > button')
  );
  const index = cells.indexOf(node);
  if (index === -1) return { x: 0, y: 0, width: 0, height: 0 };
  // The stand-in lays a cell out under the track's last rendered style, one render behind.
  return group() && native(group())?.style.flexDirection === 'column'
    ? {
        x: INSET_PX,
        y: INSET_PX + index * (OPTION_HEIGHT_PX + INSET_PX),
        width: STACKED_CELL_PX,
        height: OPTION_HEIGHT_PX,
      }
    : {
        x: INSET_PX + index * (ROW_CELL_PX + INSET_PX),
        y: INSET_PX,
        width: ROW_CELL_PX,
        height: OPTION_HEIGHT_PX,
      };
}

function Picker({ initial, ...props }) {
  const [selected, setSelected] = useState(initial);
  return h(RsdSegmentedPicker, {
    label: 'Theme',
    options: THEME_OPTIONS,
    selected,
    onSelect: (value) => {
      selections.push(value);
      setSelected(value);
    },
    ...props,
  });
}

async function render(element) {
  await act(async () =>
    root.render(
      h(
        ReduceMotionPreferenceProvider,
        { preference: 'full' },
        h(DrawingAppearanceProvider, { preference: 'light' }, element)
      )
    )
  );
}

const group = () => container.querySelector('[role="radiogroup"]');
const option = (label) => container.querySelector(`button[aria-label="${label}"]`);
const label = (name) => option(name).querySelector('span');
const cell = (name) => option(name).parentElement;
const thumb = () => container.querySelector('[data-testid="reanimated-view"]');
async function layOut(node, ...lines) {
  await act(async () =>
    native(node).props.onTextLayout({
      nativeEvent: { lines: lines.map(([text, width]) => ({ text, width })) },
    })
  );
}

describe('segment track at a large OS font', () => {
  it('stacks its options across the track when a label breaks mid-word, keeping selection', async () => {
    await render(h(Picker, { initial: 'system' }));
    expect(native(group()).style.flexDirection).toBe('row');
    expect(native(cell('Light')).style).toMatchObject({ flexGrow: 1, flexBasis: 0 });
    await layOut(label('Light'), ['Light', 90]);
    expect(native(group()).style.flexDirection).toBe('row');
    host.writes.length = 0;
    await layOut(label('System'), ['Syst', 90], ['em', 50]);
    await render(h(Picker, { initial: 'system' }));
    expect(native(group()).style.flexDirection).toBe('column');
    expect(native(cell('Light')).style.flexBasis).toBeUndefined();
    expect(native(thumb()).style).toMatchObject({ left: 0, right: 0, top: 0 });
    expect(host.writes).toEqual(
      expect.arrayContaining([INSET_PX + 2 * (OPTION_HEIGHT_PX + INSET_PX), OPTION_HEIGHT_PX])
    );
    expect(native(thumb().firstElementChild).style).toMatchObject({
      marginVertical: 0,
      marginHorizontal: INSET_PX,
    });
    expect(group().getAttribute('aria-label')).toBe('Theme');
    expect([...container.querySelectorAll('button')].map((node) => node.textContent)).toEqual([
      'Light',
      'Dark',
      'System',
    ]);
    expect(option('System').getAttribute('aria-checked')).toBe('true');
    expect(native(label('System')).props.allowFontScaling).not.toBe(false);
    expect(native(label('System')).props.maxFontSizeMultiplier).toBeUndefined();
    host.writes.length = 0;
    await act(async () => option('Dark').click());
    expect(selections).toEqual(['dark']);
    expect(option('Dark').getAttribute('aria-checked')).toBe('true');
    expect(host.writes.map((write) => write.to)).toEqual([
      INSET_PX + OPTION_HEIGHT_PX + INSET_PX,
      OPTION_HEIGHT_PX,
    ]);
  });

  it('stays stacked once its labels fit, and lays out side by side again for a new OS font', async () => {
    await render(h(Picker, { initial: 'light' }));
    await layOut(label('System'), ['Syst', 90], ['em', 50]);
    await render(h(Picker, { initial: 'light' }));
    expect(native(group()).style.flexDirection).toBe('column');
    await layOut(label('System'), ['System', 140]);
    expect(native(group()).style.flexDirection).toBe('column');
    fontScale = 1;
    await render(h(Picker, { initial: 'light' }));
    expect(native(group()).style.flexDirection).toBe('row');
    expect(native(thumb()).style.right).toBeUndefined();
  });

  it('asks afresh once a Settings zoom pinch finishes', async () => {
    const zoomed = (pinches) =>
      h(TextZoomRevision, { value: pinches }, h(Picker, { initial: 'light' }));
    await render(zoomed(1));
    await layOut(label('System'), ['Syst', 90], ['em', 50]);
    await render(zoomed(1));
    expect(native(group()).style.flexDirection).toBe('column');
    await render(zoomed(2));
    expect(native(group()).style.flexDirection).toBe('row');
  });

  it('keeps a whole-word wrap side by side', async () => {
    const options = [
      { value: 'bug', label: "Something's broken" },
      { value: 'feature', label: 'I have an idea' },
    ];
    await render(h(Picker, { initial: 'bug', options }));
    await layOut(label("Something's broken"), ["Something's ", 95], ['broken', 60]);
    expect(native(group()).style.flexDirection).toBe('row');
  });

  it('gives a stacked option its icon beside its label at the ordinary label size', async () => {
    await render(h(Picker, { initial: 'light', optionDirection: 'column', tight: true }));
    expect(native(option('Light')).style.flexDirection).toBe('column');
    expect(native(label('Light')).style.fontSize).toBe(Number.parseFloat(scale.fontSizeXs));
    expect(native(group()).style.padding ?? native(group()).style.paddingTop).toBe(
      PICKER_METRICS.TIGHT_TRACK_PADDING_PX
    );
    await layOut(label('Light'), ['Lig', 40], ['ht', 30]);
    await render(h(Picker, { initial: 'light', optionDirection: 'column', tight: true }));
    expect(native(option('Light')).style.flexDirection).toBe('row');
    expect(native(label('Light')).style.fontSize).toBe(Number.parseFloat(scale.fontSizeSm));
    expect(native(group()).style.padding ?? native(group()).style.paddingTop).toBe(INSET_PX);
  });

  it('shrinks a stacked label whose word is still wider than the whole track', async () => {
    host.layoutOf = (node) =>
      node.tagName === 'SPAN' && node.getAttribute('aria-hidden') === 'true'
        ? { x: 0, y: 0, width: 400, height: 50 }
        : node.tagName === 'SPAN'
          ? { x: 0, y: 0, width: 250, height: 50 }
          : cellLayout(node);
    await render(h(Picker, { initial: 'light' }));
    const size = native(label('System')).style.fontSize;
    await layOut(label('System'), ['Syst', 90], ['em', 50]);
    await render(h(Picker, { initial: 'light' }));
    expect(native(label('System')).style.fontSize).toBe(size);
    await layOut(label('System'), ['Syste', 240], ['m', 40]);
    expect(native(label('System')).style.fontSize).toBeCloseTo((size * 250 * 0.98) / 400);
    expect(native(label('Light')).style.fontSize).toBe(size);
  });

  it('never stacks words it does not show', async () => {
    await render(h(Picker, { initial: 'light', labels: 'hidden' }));
    expect(option('Light').querySelector('span')).toBeNull();
    expect(native(group()).style.flexDirection).toBe('row');
  });
});

describe('cover caption at a large OS font', () => {
  const COVER_PX = 150;
  const tile = () =>
    h(RsdColoringTile, {
      shape: 'cover',
      label: 'Dinosaurs',
      theme: 'light',
      image: 'file:///cover.png',
      width: COVER_PX,
      accessibleName: 'Dinosaurs coloring book',
      onPress() {},
    });
  const caption = () => container.querySelector('[data-testid="cover-caption"]');
  const captionText = () => caption().querySelector('span');

  it('reserves the shipping band at an ordinary size and grows with taller text', async () => {
    let captionHeight = COVER_CAPTION_HEIGHT_PX;
    host.layoutOf = (node) =>
      node.dataset.testid === 'cover-caption'
        ? { x: 0, y: 0, width: COVER_PX, height: captionHeight }
        : { x: 0, y: 0, width: COVER_PX - 2 * TILE_ART_INSET_PX, height: 20 };
    await render(tile());
    expect(native(caption().firstElementChild).style.minHeight).toBe(COVER_CAPTION_HEIGHT_PX);
    const art = () => native(caption().previousElementSibling).style;
    expect(art().bottom).toBe(COVER_CAPTION_HEIGHT_PX);
    captionHeight = 64;
    await render(tile());
    await render(tile());
    expect(art().bottom).toBe(64);
    expect(captionText().textContent).toBe('Dinosaurs');
  });

  it('shrinks a caption word wider than the tile just enough to fit', async () => {
    host.layoutOf = (node) =>
      node.getAttribute('aria-hidden') === 'true' && node.tagName === 'SPAN'
        ? { x: 0, y: 0, width: 240, height: 50 }
        : { x: 0, y: 0, width: 130, height: 50 };
    await render(tile());
    const size = native(captionText()).style.fontSize;
    await layOut(captionText(), ['Dinosa', 128], ['urs', 60]);
    expect(native(captionText()).style.fontSize).toBeCloseTo((size * 130 * 0.98) / 240);
    expect(native(captionText()).props.allowFontScaling).not.toBe(false);
  });
});

describe('settings table of contents at a large OS font', () => {
  const row = (active) =>
    h(RsdSidebarRow, {
      icon: 'appearance',
      label: 'Appearance',
      unseen: false,
      active,
      onSelect() {},
    });
  const text = () => container.querySelector('[data-testid="sidebar-row"] > span');

  it('keeps its reading-position ink and shrinks a name too wide for the fixed column', async () => {
    host.layoutOf = (node) =>
      node.getAttribute('aria-hidden') === 'true' && node.tagName === 'SPAN'
        ? { x: 0, y: 0, width: 275, height: 50 }
        : { x: 0, y: 0, width: 154, height: 50 };
    await render(row(true));
    expect(native(text()).style.color).toBe(themes.light.brandText);
    const size = native(text()).style.fontSize;
    await layOut(text(), ['Appeara', 150], ['nce', 70]);
    expect(native(text()).style.fontSize).toBeCloseTo((size * 154 * 0.98) / 275);
    expect(text().textContent).toBe('Appearance');
    await render(row(false));
    expect(native(text()).style.color).toBe(themes.light.textSoft);
  });
});

describe('settings switch row at a large OS font', () => {
  it('shrinks only a label word too wide for the room beside its switch', async () => {
    host.layoutOf = (node) =>
      node.getAttribute('aria-hidden') === 'true' && node.tagName === 'SPAN'
        ? { x: 0, y: 0, width: node.textContent === 'double-tap' ? 260 : 130, height: 50 }
        : { x: 0, y: 0, width: 210, height: 50 };
    await render(
      h(RsdToggleRow, {
        icon: 'brush-eraser',
        label: 'Apple Pencil double-tap to erase',
        id: 'pencilEraserToggle',
        checked: false,
        onToggle() {},
      })
    );
    const text = () => container.querySelector('[data-testid="pencilEraserToggle-row"] span');
    const size = native(text()).style.fontSize;
    await layOut(text(), ['Apple Pencil', 200], ['double-ta', 205], ['p to erase', 190]);
    expect(native(text()).style.fontSize).toBeCloseTo((size * 210 * 0.98) / 260);
    expect(container.querySelector('[role="switch"]').getAttribute('aria-label')).toBe(
      'Apple Pencil double-tap to erase'
    );
  });
});

describe('settings slider name at a large OS font', () => {
  it('shrinks a name word too wide for the room beside its value', async () => {
    host.layoutOf = (node) =>
      node.getAttribute('aria-hidden') === 'true' && node.tagName === 'SPAN'
        ? { x: 0, y: 0, width: 190, height: 50 }
        : { x: 0, y: 0, width: 150, height: 50 };
    await render(h(RsdSliderRow, { id: 'volume', label: 'Volume', value: 50, onInput() {} }));
    const name = () =>
      [...container.querySelectorAll('span')].find((node) => node.textContent === 'Volume');
    const size = native(name()).style.fontSize;
    await layOut(name(), ['Volum', 148], ['e', 30]);
    expect(native(name()).style.fontSize).toBeCloseTo((size * 150 * 0.98) / 190);
    expect(container.textContent).toContain('50%');
  });
});

describe('fitted text when its room changes without a new window or font scale', () => {
  const WORD_PX = 190;
  let roomPx;
  const row = (pinches) =>
    h(
      TextZoomRevision,
      { value: pinches },
      h(RsdToggleRow, { icon: 'sound', label: 'Volume', id: 'v', checked: false, onToggle() {} })
    );
  const text = () => container.querySelector('[data-testid="v-row"] span');
  beforeEach(() => {
    roomPx = 200;
    host.layoutOf = (node) =>
      node.getAttribute('aria-hidden') === 'true' && node.tagName === 'SPAN'
        ? { x: 0, y: 0, width: WORD_PX, height: 50 }
        : { x: 0, y: 0, width: roomPx, height: 50 };
  });
  const relayout = async (width) =>
    act(async () =>
      native(text()).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 50 } } })
    );

  it('fits a word that broke before its narrower width was reported', async () => {
    await render(row(0));
    const size = native(text()).style.fontSize;
    await layOut(text(), ['Volu', 95], ['me', 50]);
    expect(native(text()).style.fontSize).toBe(size);
    roomPx = 100;
    await relayout(100);
    expect(native(text()).style.fontSize).toBeCloseTo((size * 100 * 0.98) / WORD_PX);
  });

  it('fits a word whose break and narrower width arrive in one batch', async () => {
    await render(row(0));
    const size = native(text()).style.fontSize;
    const { onTextLayout, onLayout } = native(text()).props;
    await act(async () => {
      onTextLayout({
        nativeEvent: {
          lines: [
            { text: 'Volu', width: 95 },
            { text: 'me', width: 50 },
          ],
        },
      });
      onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 50 } } });
    });
    expect(native(text()).style.fontSize).toBeCloseTo((size * 100 * 0.98) / WORD_PX);
  });

  it('grows back to its full size once a finished pinch gives it room again', async () => {
    roomPx = 100;
    await render(row(0));
    const size = native(text()).style.fontSize;
    await layOut(text(), ['Volu', 95], ['me', 50]);
    expect(native(text()).style.fontSize).toBeCloseTo((size * 100 * 0.98) / WORD_PX);
    roomPx = 200;
    await render(row(1));
    expect(native(text()).style.fontSize).toBe(size);
    await layOut(text(), ['Volume', 190]);
    expect(native(text()).style.fontSize).toBe(size);
  });
});
