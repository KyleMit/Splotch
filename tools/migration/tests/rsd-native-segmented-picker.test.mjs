import { act, createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { host, native, resetHost } from './rsd-native-control-host.mjs';
import { yogaTrackLayout } from './rsd-yoga-host.mjs';
import { html } from 'react-strict-dom';
import { PHONE_MAX_WIDTH_PX } from '../../../src/lib/breakpoints.ts';
import { brand, scale, themes } from '../../../src/lib/design/tokens.ts';

import { darkTheme } from '../../../src/rsdDrawing/tokens.css.ts';
import { DrawingAppearanceProvider } from '../../../src/drawing/DrawingAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../../src/drawing/useReduceMotion.ts';
import {
  PICKER_METRICS,
  RsdSegmentedPicker,
  thumbOrigin,
} from '../../../src/rsdDrawing/RsdSegmentedPicker.tsx';
import {
  arrowDelta,
  nextEnabledIndex,
  rovingTabIndex,
} from '../../../src/rsdDrawing/rovingRadio.ts';

const WEB_PLATFORM = '../../../src/rsdDrawing/pickerPlatform.ts';
vi.mock(
  '../../../src/rsdDrawing/pickerPlatform.ts',
  () => import('../../../src/rsdDrawing/pickerPlatform.native.ts')
);
const CELL_WIDTH_PX = 100;
// The first Yoga case compiles React Native's Yoga sources before it lays anything out.
const YOGA_COMPILE_TIMEOUT_MS = 180_000;
const TRACK_INSET_PX = Number.parseFloat(scale.space1);
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'theme-light' },
  { value: 'dark', label: 'Dark', icon: 'theme-dark' },
  { value: 'system', label: 'System', icon: 'theme-auto', disabled: true },
];
const VIEW_OPTIONS = [
  { value: 'android', label: 'First view', icon: 'android' },
  { value: 'ios', label: 'Second view', icon: 'phone-tablet' },
];
const CHIP_OPTIONS = [
  { value: 'eraser', label: 'Eraser', icon: 'brush-eraser' },
  { value: 'camera', label: 'Screenshot', icon: 'camera' },
  { value: 'shapes', label: 'Shapes', icon: 'shapes' },
];

// Each painted part's colour token, held both to the colour the port resolves and to the token the
// shipping selector assigns it.
const PAINT = {
  segmentTrack: { selector: '.segment', property: 'background', token: 'controlTrack' },
  segmentThumb: { selector: '.segment .thumb', property: 'background', token: 'brandSolid' },
  segmentInk: { selector: '.segment .option', property: 'color', token: 'text' },
  segmentActiveInk: { selector: '.segment .option.active', property: 'color', token: 'onBrand' },
  optionInk: { selector: '.option', property: 'color', token: 'textSoft' },
  chipFill: { selector: '.chip .option', property: 'background', token: 'controlTrack' },
  chipActiveFill: { selector: '.chip .option.active', property: 'background', token: 'brandSolid' },
  chipActiveInk: { selector: '.chip .option.active', property: 'color', token: 'onBrand' },
  underlineActiveInk: {
    selector: '.underline .option.active',
    property: 'color',
    token: 'brandText',
  },
  underlineSegment: {
    selector: '.underline .option.active',
    property: 'border-bottom-color',
    token: 'brand',
  },
};
const paint = (part, theme) => ({ ...themes[theme], ...brand })[PAINT[part].token];

const rgba = (value) =>
  value.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );

// Each option cell sits CELL_WIDTH_PX wide, a track inset apart, in source order.
function cellLayout(width) {
  return (node) => {
    const cells = [...node.parentElement.children].filter((child) => child.querySelector('button'));
    const index = cells.indexOf(node);
    return { x: TRACK_INSET_PX + index * (width + TRACK_INSET_PX), y: 0, width, height: 48 };
  };
}

let root, container, selections;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  resetHost();
  host.layoutOf = cellLayout(CELL_WIDTH_PX);
  selections = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function Picker({ initial, mode, ...props }) {
  const [selected, setSelected] = useState(initial);
  return h(RsdSegmentedPicker, {
    label: 'Theme',
    options: THEME_OPTIONS,
    mode,
    selected,
    onSelect: (value) => {
      selections.push(value);
      setSelected((current) =>
        mode === 'toggle'
          ? current.includes(value)
            ? current.filter((item) => item !== value)
            : [...current, value]
          : value
      );
    },
    ...props,
  });
}

async function mount(props, { theme = 'light', motion = 'full' } = {}) {
  await act(async () =>
    root.render(
      h(
        ReduceMotionPreferenceProvider,
        { preference: motion },
        h(
          DrawingAppearanceProvider,
          { preference: theme },
          h(html.div, { style: theme === 'dark' ? darkTheme : null }, h(Picker, props))
        )
      )
    )
  );
}

const group = () => container.querySelector('[role="radiogroup"], [role="group"]');
const options = () => [...container.querySelectorAll('button')];
const option = (label) => container.querySelector(`button[aria-label="${label}"]`);
// React Strict DOM hands an option's text styles to the label it wraps.
const ink = (label) => native(option(label).querySelector('span')).style.color;
// The specimen icons are deferred: their markup arrives once the lazy icon chunk resolves.
const iconXml = async (label) => {
  await vi.waitFor(() =>
    expect(option(label).querySelector('svg').getAttribute('data-xml')).toContain('<path')
  );
  return option(label).querySelector('svg').getAttribute('data-xml');
};
const thumb = () => container.querySelector('[data-testid="reanimated-view"]');
const travel = (to) => ({
  to,
  config: {
    duration: PICKER_METRICS.THUMB_TRAVEL_MS,
    easing: { bezier: [...PICKER_METRICS.EASE_GLIDE] },
    reduceMotion: 'never',
  },
});
const cellX = (index) => TRACK_INSET_PX + index * (CELL_WIDTH_PX + TRACK_INSET_PX);

async function press(label) {
  await act(async () => option(label).click());
}

describe('radio mode', () => {
  it('ports the roving-radio rules case for case', () => {
    for (const [key, delta] of [
      ['ArrowLeft', -1],
      ['ArrowUp', -1],
      ['ArrowRight', 1],
      ['ArrowDown', 1],
      ['Home', 0],
      ['Enter', 0],
      [' ', 0],
    ])
      expect(arrowDelta(key), key).toBe(delta);

    const layouts = [
      {
        disabled: [false, false, false],
        next: [
          [2, 1],
          [0, 2],
          [1, 0],
        ],
        tab: [0, 0, 1, 2],
      },
      {
        disabled: [true, false, false],
        next: [
          [2, 1],
          [2, 2],
          [1, 1],
        ],
        tab: [1, 1, 1, 2],
      },
      {
        disabled: [false, true, false],
        next: [
          [2, 2],
          [0, 2],
          [0, 0],
        ],
        tab: [0, 0, 0, 2],
      },
      {
        disabled: [false, false, true],
        next: [
          [1, 1],
          [0, 0],
          [1, 0],
        ],
        tab: [0, 0, 1, 0],
      },
      {
        disabled: [true, true, false],
        next: [
          [2, 2],
          [2, 2],
          [2, 2],
        ],
        tab: [2, 2, 2, 2],
      },
      {
        disabled: [true, true, true],
        next: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
        tab: [-1, -1, -1, -1],
      },
    ];
    for (const { disabled, next, tab } of layouts) {
      const options = disabled.map((disabled, value) => ({ disabled, value }));
      const context = JSON.stringify(disabled);
      for (let from = 0; from < options.length; from++)
        for (const [direction, delta] of [-1, 1].entries())
          expect(
            nextEnabledIndex(options, from, delta),
            `${context} from ${from} by ${delta}`
          ).toBe(next[from][direction]);
      for (const [index, selected] of [-1, 0, 1, 2].entries())
        expect(
          rovingTabIndex(options, (value) => value === selected),
          `${context} selected ${selected}`
        ).toBe(tab[index]);
    }
  });

  it('names a radiogroup of checked options, each enabled one a native focus and activation stop', async () => {
    await mount({ initial: 'dark' });
    expect(group().getAttribute('aria-label')).toBe('Theme');
    expect(group().getAttribute('role')).toBe('radiogroup');
    expect(options().map((button) => button.getAttribute('role'))).toEqual([
      'radio',
      'radio',
      'radio',
    ]);
    expect(options().map((button) => button.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(options().map((button) => native(button).props.focusable)).toEqual([true, true, false]);
    expect(option('System').getAttribute('aria-disabled')).toBe('true');
    expect(native(option('System')).props.disabled).toBe(true);
  });

  it('keeps every enabled option a native stop while nothing is selected', async () => {
    await mount({ initial: null });
    expect(options().map((button) => native(button).props.focusable)).toEqual([true, true, false]);
    expect(thumb()).toBeNull();
  });

  it('selects the pressed option and moves the check with it', async () => {
    await mount({ initial: 'light' });
    await press('Dark');
    expect(selections).toEqual(['dark']);
    expect(option('Dark').getAttribute('aria-checked')).toBe('true');
    expect(option('Light').getAttribute('aria-checked')).toBe('false');
  });

  it('moves selection and focus with the arrow keys, wrapping and skipping disabled options', async () => {
    const focus = vi.spyOn(HTMLButtonElement.prototype, 'focus').mockImplementation(() => {});
    await mount({ initial: 'light' });
    const key = async (label, name) =>
      act(async () =>
        option(label).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
      );
    await key('Light', 'ArrowRight');
    await key('Dark', 'ArrowDown');
    await key('Light', 'ArrowLeft');
    await key('Dark', 'Enter');
    expect(selections).toEqual(['dark', 'light', 'dark']);
    expect(focus).toHaveBeenCalledTimes(3);
    focus.mockRestore();
  });
});

describe('segment thumb', () => {
  it('places the thumb on the selected cell without travel on first paint', async () => {
    await mount({ initial: 'dark' });
    expect(thumb().getAttribute('aria-hidden')).toBe('true');
    expect(host.writes).toEqual([cellX(1), CELL_WIDTH_PX]);
  });

  it('glides to a newly selected cell over the shipping travel and curve', async () => {
    await mount({ initial: 'light' });
    host.writes.length = 0;
    await press('Dark');
    expect(host.writes).toEqual([travel(cellX(1)), travel(CELL_WIDTH_PX)]);
  });

  it('snaps when a resize moves the cells under an unchanged selection', async () => {
    await mount({ initial: 'light' });
    await press('Dark');
    host.writes.length = 0;
    host.layoutOf = cellLayout(CELL_WIDTH_PX * 2);
    await mount({ initial: 'dark' });
    expect(host.writes).toEqual([
      TRACK_INSET_PX + CELL_WIDTH_PX * 2 + TRACK_INSET_PX,
      CELL_WIDTH_PX * 2,
    ]);
  });

  it('pins the thumb to the physical left, which a swapped RTL layout calls right', async () => {
    await mount({ initial: 'dark' });
    expect(native(thumb()).style).toMatchObject({ left: 0 });
    expect(native(thumb()).style.right).toBeUndefined();
    host.rtl = true;
    await mount({ initial: 'light' });
    expect(native(thumb()).style).toMatchObject({ right: 0 });
    expect(native(thumb()).style.left).toBeUndefined();
  });

  it('snaps instead of gliding under reduced motion', async () => {
    await mount({ initial: 'light' }, { motion: 'reduce' });
    host.writes.length = 0;
    await press('Dark');
    expect(host.writes).toEqual([cellX(1), CELL_WIDTH_PX]);
  });

  it('paints the thumb with the brand fill and control shadow on both papers', async () => {
    for (const theme of ['light', 'dark']) {
      await mount({ initial: 'light' }, { theme });
      const face = native(thumb().firstElementChild).style;
      expect(face.backgroundColor, theme).toBe(paint('segmentThumb', theme));
      expect(face.boxShadow, theme).toBe(rgba(scale.shadowControl));
      expect(native(group()).style.backgroundColor, theme).toBe(paint('segmentTrack', theme));
      expect(ink('Light'), theme).toBe(paint('segmentActiveInk', theme));
      expect(ink('Dark'), theme).toBe(paint('segmentInk', theme));
    }
  });

  // Issue 3136: unmeasured, as on a prerendered page, the selected label sat white on the track.
  it('backs the selected option with the thumb face until its cell is measured', async () => {
    host.layoutOf = () => null;
    await mount({ initial: 'light' });
    expect(thumb()).toBeNull();
    expect(native(option('Light')).style.backgroundColor).toBe(paint('segmentThumb', 'light'));
    expect(native(option('Light')).style.boxShadow).toBe(rgba(scale.shadowControl));
    expect(native(option('Dark')).style.backgroundColor).toBe('transparent');
    host.layoutOf = cellLayout(CELL_WIDTH_PX);
    await mount({ initial: 'light' });
    expect(thumb()).not.toBeNull();
    expect(native(option('Light')).style.backgroundColor).toBe('transparent');
  });

  it('draws a 48px option with a 16px icon inked on-brand only while selected', async () => {
    await mount({ initial: 'light' });
    const light = native(option('Light')).style;
    expect([light.minWidth, light.minHeight]).toEqual([48, 48]);
    const icons = options().map((button) => button.querySelector('svg'));
    expect(icons.map((icon) => icon.getAttribute('width'))).toEqual(['16', '16', '16']);
    // Beside the label rather than inside a text, which would set the icon on the label's baseline.
    expect(icons.map((icon) => icon.closest('span'))).toEqual([null, null, null]);
    expect(await iconXml('Light')).toContain('fill="#fff"');
    expect(await iconXml('Dark')).toContain(`fill="${themes.light.iconInk}"`);
  });

  it('hugs its options when it does not fill and keeps names when labels are hidden', async () => {
    await mount({ initial: 'light', fill: false, labels: 'hidden' });
    expect(native(group()).style.alignSelf).toBe('flex-start');
    expect(native(option('Light')).style.paddingHorizontal).toBe(
      PICKER_METRICS.HUG_OPTION_PADDING_INLINE_PX
    );
    expect(option('Light').textContent).toBe('');
    expect(option('Light').getAttribute('aria-label')).toBe('Light');
  });
});

describe('toggle chips', () => {
  it('names a group of independently pressed chips with a check on each pressed one', async () => {
    await mount({ initial: ['eraser'], mode: 'toggle', variant: 'chip', options: CHIP_OPTIONS });
    expect(group().getAttribute('role')).toBe('group');
    expect(options().map((button) => button.getAttribute('role'))).toEqual([
      'button',
      'button',
      'button',
    ]);
    expect(options().map((button) => button.getAttribute('aria-checked'))).toEqual([
      null,
      null,
      null,
    ]);
    expect(options().map((button) => button.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(options().map((button) => native(button).props.focusable)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(option('Eraser').querySelectorAll('svg')).toHaveLength(2);
    expect(option('Screenshot').querySelectorAll('svg')).toHaveLength(1);
    expect(thumb()).toBeNull();
    await press('Screenshot');
    await press('Eraser');
    expect(selections).toEqual(['camera', 'eraser']);
    expect(options().map((button) => button.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('lays the chips two to a row on the track fill, brand-filled while pressed', async () => {
    for (const theme of ['light', 'dark']) {
      await mount(
        { initial: ['eraser'], mode: 'toggle', variant: 'chip', options: CHIP_OPTIONS },
        { theme }
      );
      const rows = [...group().children];
      expect(rows.map((row) => row.querySelectorAll('button').length)).toEqual([2, 1]);
      expect(native(option('Eraser')).style.backgroundColor, theme).toBe(
        paint('chipActiveFill', theme)
      );
      expect(ink('Eraser'), theme).toBe(paint('chipActiveInk', theme));
      expect(native(option('Screenshot')).style.backgroundColor, theme).toBe(
        paint('chipFill', theme)
      );
      expect(ink('Screenshot'), theme).toBe(paint('optionInk', theme));
      expect(option('Eraser').querySelector('svg').getAttribute('width')).toBe('26');
    }
  });
});

describe('underline tabs', () => {
  it('marks the live tab with the brand segment and its accessible ink', async () => {
    for (const theme of ['light', 'dark']) {
      await mount({ initial: 'light', variant: 'underline' }, { theme });
      expect(native(option('Light')).style.borderBottomColor, theme).toBe(
        paint('underlineSegment', theme)
      );
      expect(ink('Light'), theme).toBe(paint('underlineActiveInk', theme));
      expect(ink('Dark'), theme).toBe(paint('optionInk', theme));
      expect(await iconXml('Light')).toContain(`fill="${themes[theme].brandText}"`);
      expect(thumb()).toBeNull();
    }
  });

  it('inks the unfilled android and phone-tablet glyphs with the tab ink once their chunk loads', async () => {
    for (const theme of ['light', 'dark']) {
      await mount({ initial: 'android', variant: 'underline', options: VIEW_OPTIONS }, { theme });
      const live = await iconXml('First view');
      const idle = await iconXml('Second view');
      expect(live, theme).toMatch(new RegExp(`^<svg [^>]*fill="${themes[theme].brandText}"`));
      expect(idle, theme).toMatch(new RegExp(`^<svg [^>]*fill="${themes[theme].textSoft}"`));
      expect(live + idle).not.toContain('currentColor');
    }
  });

  it('splits the row evenly at phone width and hugs its labels above it', async () => {
    host.windowWidth = PHONE_MAX_WIDTH_PX;
    await mount({ initial: 'light', variant: 'underline' });
    expect(native(group()).style.gap).toBe(0);
    expect(native(option('Light').parentElement).style.flexGrow).toBe(1);
    host.windowWidth = PHONE_MAX_WIDTH_PX + 1;
    await mount({ initial: 'light', variant: 'underline' });
    expect(native(group()).style.gap).toBe(PICKER_METRICS.UNDERLINE_GAP_PX);
    expect(native(option('Light').parentElement).style.flexGrow).toBeUndefined();
  });
});

describe('thumb origin in React Native Yoga', () => {
  const TRACK_PX = 320;
  const CELLS = 3;
  // React Native's style processing: with the RTL swap on, left and right name the start and end.
  const yogaEdge = (origin, swap) => {
    const [key] = Object.keys(origin);
    return swap ? { left: 'start', right: 'end' }[key] : key;
  };

  it.each([
    ['LTR', { isRTL: false, doLeftAndRightSwapInRTL: true }, 'ltr'],
    ['RTL with the left/right swap', { isRTL: true, doLeftAndRightSwapInRTL: true }, 'rtl'],
    ['RTL without the swap', { isRTL: true, doLeftAndRightSwapInRTL: false }, 'rtl'],
  ])(
    'lands the thumb on every measured cell in %s',
    (_, i18n, direction) => {
      const layout = yogaTrackLayout({
        width: TRACK_PX,
        cells: CELLS,
        inset: TRACK_INSET_PX,
        direction,
        edge: yogaEdge(thumbOrigin(i18n), i18n.isRTL && i18n.doLeftAndRightSwapInRTL),
      });
      expect(layout.cells).toHaveLength(CELLS);
      for (const cellLeft of layout.cells) expect(layout.thumb + cellLeft).toBe(cellLeft);
    },
    YOGA_COMPILE_TIMEOUT_MS
  );
});

describe('drift from the shipping picker', () => {
  const px = (value) => Number.parseFloat(value);

  it('holds every literal the port carries to the Svelte style block', () => {
    expect(PICKER_METRICS.UNDERLINE_RULE_OVERLAP_PX).toBe(-px(scale.borderWidth));
    expect(`cubic-bezier(${PICKER_METRICS.EASE_GLIDE.join(', ')})`).toBe(scale.easeGlide);
    expect(PICKER_METRICS.PHONE_MAX_WIDTH_PX).toBe(PHONE_MAX_WIDTH_PX);
  });

  it('keeps aria-pressed for the web build, where the DOM carries it', async () => {
    const web = await vi.importActual(WEB_PLATFORM);
    expect(web.pressedState(true)).toEqual({ 'aria-pressed': true });
  });
});
