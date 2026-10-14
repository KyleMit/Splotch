import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { scale, themes } from '../../../web/src/lib/design/tokens.ts';
import { BARE_MENU_GAP_PX } from '../../../web/src/lib/glassPaneGeometry.ts';
import { control, host, markup, mount, view } from './rsd-native-button-host.mjs';
import {
  BARE_OPTION_OUTLINE_PX,
  BARE_TILE_DISABLED_FILTER,
  BARE_TILE_LIFT_SCALE,
  BARE_TILE_PADDING_SHARE,
  BARE_TILE_PRESS_SCALE,
  RsdIconButton,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { BARE_FLYOUT_MENU_GAP_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdFlyoutMenu.tsx';
import { ToolbarSkin } from '../../../experiments/native-architecture/src/rsdDrawing/toolbarSkin.ts';
import * as GLASS from '../../../experiments/native-architecture/src/rsdDrawing/bareGlassStyle.ts';
import {
  BARE_GLASS_THEMES,
  GLASS_FROST,
} from '../../../experiments/native-architecture/src/rsdDrawing/bareGlassTheme.ts';
import { glassPaneLayout } from '../../../experiments/native-architecture/src/rsdDrawing/bareGlassSpace.ts';
import {
  COLOR_MENU_GAP_PX,
  COLOR_MENU_LABELS,
  COLOR_MENU_PADDING_PX,
  COLOR_MENU_SWATCH_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/colorMenuLayout.ts';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';

const read = (path) => readFileSync(join(import.meta.dirname, '../../../', path), 'utf8');
const styleBlock = (source) => /<style>([\s\S]*)<\/style>/.exec(source)[1];

const SOURCES = {
  app: read('web/src/app.css'),
  paper: styleBlock(read('web/src/lib/components/BareToolbarPaper.svelte')),
  panes: styleBlock(read('web/src/lib/components/GlassPanes.svelte')),
};

// Every rule whose selector list is exactly `selector`, innermost blocks included, in source order.
function rules(css, selector) {
  const wanted = selector.replace(/\s+/g, ' ').trim();
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.replace(/\s+/g, ' ').trim() === wanted)
    .map(([, , body]) =>
      Object.fromEntries(
        body
          .split(/;(?![^(]*\))/)
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .map((declaration) => {
            const colon = declaration.indexOf(':');
            return [
              declaration.slice(0, colon).trim(),
              declaration
                .slice(colon + 1)
                .replace(/\s+/g, ' ')
                .trim(),
            ];
          })
      )
    );
}

function declaration(css, selector, property, index = 0) {
  const value = rules(css, selector)
    .map((rule) => rule[property])
    .filter((found) => found !== undefined)[index];
  if (value === undefined) throw new Error(`No shipping ${property} for ${selector}`);
  return value;
}

const number = (value, pattern) => {
  const match = pattern.exec(value);
  if (!match) throw new Error(`${value} does not match ${pattern}`);
  return Number(match[1]);
};

const BARE = "html[data-toolbar='bare']";

function shippingBare({ app, paper, panes }) {
  const outline = declaration(
    app,
    `${BARE} .actions-panel .flyout-option.active .action-icon`,
    'filter'
  );
  return {
    BARE_TILE_PADDING_SHARE: number(
      declaration(app, `${BARE} .actions-panel .action-button`, 'padding'),
      /^calc\(var\(--action-btn-size\) \/ (\d+)\)$/
    ),
    BARE_TILE_PRESS_SCALE: number(
      declaration(
        app,
        `${BARE} .actions-panel .action-button:active:not(:disabled):not(.disabled), ${BARE} .actions-panel #undoButton.disabled:active, ${BARE} .actions-panel .action-button:active`,
        'transform'
      ),
      /^scale\(([\d.]+)\)$/
    ),
    BARE_TILE_LIFT_SCALE: [
      declaration(app, `${BARE} .actions-panel .action-button[aria-expanded='true']`, 'transform'),
      declaration(
        app,
        `${BARE} .actions-panel .action-button:not(:disabled):not(.disabled):hover:not(:active)`,
        'transform'
      ),
    ]
      .map((value) => number(value, /^scale\(([\d.]+)\)$/))
      .reduce((expanded, hovered) => (expanded === hovered ? expanded : NaN)),
    BARE_TILE_DISABLED_FILTER: declaration(
      app,
      `${BARE} .actions-panel .action-button:is(:disabled, .disabled)`,
      'filter'
    ),
    BARE_OPTION_OUTLINE_PX:
      [...outline.matchAll(/drop-shadow\(([^)]*?) 0 var\(--text-strong\)\)/g)]
        .map(([, offset]) => offset)
        .join(' | ') === '2px 0 | -2px 0 | 0 2px | 0 -2px'
        ? 2
        : outline,
    BARE_FLYOUT_MENU_GAP_PX: number(
      declaration(app, `${BARE} .actions-panel .flyout-menu`, 'gap'),
      /^(\d+)px$/
    ),
    RAIL_GLASS_BLUR_PX: number(
      declaration(paper, '.rail-glass', 'backdrop-filter'),
      /^blur\(([\d.]+)px\)$/
    ),
    STRIP_GLASS_BLUR_PX: [
      declaration(paper, '.fullscreen-glass', 'backdrop-filter'),
      declaration(panes, '.glass-pane', 'backdrop-filter'),
    ]
      .map((value) => number(value, /^blur\(([\d.]+)px\)$/))
      .reduce((corner, pane) => (corner === pane ? corner : NaN)),
    MARGIN_RULE_WIDTH_PX: number(declaration(paper, '.margin-rule', 'width'), /^(\d+)px$/),
    MARGIN_RULE_GAP_PX: number(declaration(paper, '.second', 'margin-left'), /^(\d+)px$/),
    MARGIN_RULE_INK_STOPS: [
      ...declaration(paper, '.margin-rule', 'background').matchAll(/var\(--rule-ink\) (\d+)%/g),
    ].map(([, stop]) => Number(stop)),
    MARGIN_RULE_FIBER_PX: number(declaration(paper, '.margin-rule', 'mask-size'), /^100% (\d+)px$/),
    MARGIN_RULE_SECOND_OFFSET_PX: number(
      declaration(paper, '.second', 'mask-position'),
      /^0 (\d+)px$/
    ),
    FULLSCREEN_GLASS_PX: number(declaration(paper, '.fullscreen-glass', 'width'), /^(\d+)px$/),
    MARGIN_RULE_FIBER: {
      landscape: declaration(paper, '.margin-rule', 'mask-image'),
      portrait: declaration(paper, '.margin-rule', 'mask-image', 1),
    },
    FULLSCREEN_GLASS_MASK: declaration(paper, '.fullscreen-glass', 'mask-image'),
  };
}

const NATIVE_BARE = {
  BARE_TILE_PADDING_SHARE,
  BARE_TILE_PRESS_SCALE,
  BARE_TILE_LIFT_SCALE,
  BARE_TILE_DISABLED_FILTER,
  BARE_OPTION_OUTLINE_PX,
  BARE_FLYOUT_MENU_GAP_PX,
  RAIL_GLASS_BLUR_PX: GLASS.RAIL_GLASS_BLUR_PX,
  STRIP_GLASS_BLUR_PX: GLASS.STRIP_GLASS_BLUR_PX,
  MARGIN_RULE_WIDTH_PX: GLASS.MARGIN_RULE_WIDTH_PX,
  MARGIN_RULE_GAP_PX: GLASS.MARGIN_RULE_GAP_PX,
  MARGIN_RULE_INK_STOPS: [...GLASS.MARGIN_RULE_INK_STOPS],
  MARGIN_RULE_FIBER_PX: GLASS.MARGIN_RULE_FIBER_PX,
  MARGIN_RULE_SECOND_OFFSET_PX: GLASS.MARGIN_RULE_SECOND_OFFSET_PX,
  FULLSCREEN_GLASS_PX: GLASS.FULLSCREEN_GLASS_PX,
  MARGIN_RULE_FIBER: GLASS.MARGIN_RULE_FIBER,
  FULLSCREEN_GLASS_MASK: GLASS.FULLSCREEN_GLASS_MASK,
};

describe('shipping flat toolbar drift', () => {
  it('holds every flat chrome value to its shipping declaration', () => {
    expect(NATIVE_BARE).toEqual(shippingBare(SOURCES));
    expect(BARE_FLYOUT_MENU_GAP_PX).toBe(BARE_MENU_GAP_PX);
  });

  it.each([
    [
      'app',
      'calc(var(--action-btn-size) / 10)',
      'calc(var(--action-btn-size) / 8)',
      'BARE_TILE_PADDING_SHARE',
    ],
    ['app', 'contrast(0.55)', 'contrast(0.6)', 'BARE_TILE_DISABLED_FILTER'],
    ['app', 'drop-shadow(0 -2px 0', 'drop-shadow(0 -3px 0', 'BARE_OPTION_OUTLINE_PX'],
    ['paper', 'blur(4.6px)', 'blur(4px)', 'RAIL_GLASS_BLUR_PX'],
    ['panes', 'blur(5.1px)', 'blur(6px)', 'STRIP_GLASS_BLUR_PX'],
    ['paper', 'mask-position: 0 137px', 'mask-position: 0 140px', 'MARGIN_RULE_SECOND_OFFSET_PX'],
    ['paper', "seed='7'", "seed='8'", 'MARGIN_RULE_FIBER'],
  ])('fails when the shipping %s source changes %s', (source, from, to, constant) => {
    expect(SOURCES[source]).toContain(from);
    const drifted = shippingBare({ ...SOURCES, [source]: SOURCES[source].replace(from, to) });
    expect(drifted[constant]).not.toEqual(NATIVE_BARE[constant]);
  });

  it('holds the glass and rule tokens to the shipping theme', () => {
    const shipping = Object.fromEntries(
      ['light', 'dark'].map((mode) => {
        const theme = themes[mode];
        return [
          mode,
          {
            glassTintRgb: theme.glassTintRgb,
            ruleInk: theme.ruleInk,
            ruleBlend: theme.ruleBlend,
            ruleOpacity: Number(theme.ruleOpacity),
            ruleSecondaryOpacity: Number(theme.ruleSecondaryOpacity),
          },
        ];
      })
    );
    expect(BARE_GLASS_THEMES).toEqual(shipping);
    expect(GLASS_FROST).toEqual({ glassRail: scale.glassRail, glassStrip: scale.glassStrip });
  });
});

it('gives the glass the Color Menu its trim order keeps, and the custom swatch', () => {
  const panel = {
    mode: 'phoneLandscape',
    count: 6,
    size: 48,
    optionSize: 60,
    brushOptions: 4,
    stroke: true,
  };
  const { colorMenu } = glassPaneLayout({ width: 740, height: 360, insetBottom: 0 }, panel, false);
  expect(colorMenu).toEqual({
    swatchPx: COLOR_MENU_SWATCH_PX,
    gapPx: COLOR_MENU_GAP_PX,
    paddingPx: COLOR_MENU_PADDING_PX,
    slots: COLOR_MENU_LABELS.length + 1,
  });
});

const TILE_PX = 60;
const flat = (element) => h(ToolbarSkin.Provider, { value: 'bare' }, element);

describe('flat skins', () => {
  it.each(['light', 'dark'])(
    'prints the %s action tile on the paper with no face',
    async (mode) => {
      const tile = h(RsdIconButton, {
        skin: 'tile',
        icon: 'shapes',
        label: 'Coloring books',
        size: TILE_PX,
        padding: 10,
        onPress: vi.fn(),
      });
      await mount(tile, { mode });
      // Negative control: the raised tile keeps its float face and the panel's padding.
      expect(control('Coloring books').style).toMatchObject({ borderWidth: 2, padding: 10 });
      await mount(flat(tile), { mode });
      expect(control('Coloring books').style).toMatchObject({
        width: TILE_PX,
        height: TILE_PX,
        padding: TILE_PX / BARE_TILE_PADDING_SHARE,
        borderWidth: 0,
        backgroundColor: 'transparent',
        opacity: 1,
      });
      expect(control('Coloring books').style.boxShadow ?? 'none').toBe('none');
      expect(view().querySelector('svg').getAttribute('width')).toBe(
        String(TILE_PX - (2 * TILE_PX) / BARE_TILE_PADDING_SHARE)
      );
    }
  );

  it('washes a parked flat tile out in full ink rather than fading it', async () => {
    const undo = (disabled) =>
      h(RsdIconButton, {
        skin: 'tile',
        icon: 'undo',
        label: 'Undo',
        size: TILE_PX,
        disabled,
        onPress: vi.fn(),
      });
    await mount(flat(undo(true)));
    const style = control('Undo').style;
    expect(style.opacity).toBe(1);
    expect(JSON.stringify(style.filter)).toContain('contrast');
    expect(markup()).toBe(NATIVE_ICONS.undo.light.replaceAll('currentColor', themes.light.iconInk));
    await mount(undo(true));
    expect(control('Undo').style.opacity).not.toBe(1);
  });

  it('outlines the selected flat menu option in the strong text ink instead of a brand ring', async () => {
    const option = h(RsdIconButton, {
      skin: 'flyout',
      icon: 'size-brush-3',
      label: 'Size 3',
      base: 60,
      scale: 1,
      ink: '#ab71e1',
      selection: 'radio',
      selected: true,
      onPress: vi.fn(),
    });
    await mount(flat(option));
    expect(control('Size 3').style).toMatchObject({
      borderWidth: 0,
      backgroundColor: 'transparent',
    });
    const outlines = () =>
      host.views.filter((props) => JSON.stringify(props.style.filter ?? '').includes('drop'));
    expect(JSON.stringify(outlines().at(-1)?.style.filter)).toContain(themes.light.textStrong);
    host.views.length = 0;
    await mount(option);
    expect(outlines()).toEqual([]);
  });
});
