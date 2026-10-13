import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brand, scale } from '../../../web/src/lib/design/tokens.ts';
import { px } from './rsd-native-button-host.mjs';
import {
  BRAND_HERO_SHADOW,
  BUSY_RING_BORDER_PX,
  BUSY_RING_OPACITY,
  BUSY_RING_SIZE_PX,
  BUSY_RING_TURN_MS,
  BUTTON_HERO_GAP_PX,
  BUTTON_HERO_MIN_HEIGHT_PX,
  BUTTON_LG_PADDING_BLOCK_PX,
  BUTTON_OUTLINE_PADDING_PX,
  BUTTON_PRESS_SCALE,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdButton.tsx';
import {
  ACTION_TILE_BORDER_PX,
  ACTION_TILE_DISABLED_OPACITY,
  ACTION_TILE_HOVER_SHADOW,
  ACTION_TILE_PADDING_SHARE,
  ACTION_TILE_PRESS_SCALE,
  ACTION_TILE_RADIUS_RATIO,
  BRAND_SELECTION_RING,
  CORNER_BUTTON_SIZE_PX,
  CORNER_HOVER_OPACITY,
  CORNER_IDLE_OPACITY,
  CORNER_PRESSED_OPACITY,
  FLYOUT_OPTION_MIN_BASE_PX,
  FLYOUT_OPTION_PADDING_PX,
  FLYOUT_OPTION_PRESS_SCALE,
  WHITE_INK_KEYLINE,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import {
  FLYOUT_MENU_GAP_PX,
  FLYOUT_MENU_PADDING_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdFlyoutMenu.tsx';
import { INK_KEYLINE_WIDTH_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIcon.tsx';

// The values the shipping chrome writes as literals rather than tokens, read from the two shipping
// sources and compared with the native constants.
const SHIPPING_SOURCES = {
  button: /<style>([\s\S]*)<\/style>/.exec(
    readFileSync(
      join(import.meta.dirname, '../../../web/src/lib/components/design/Button.svelte'),
      'utf8'
    )
  )[1],
  app: readFileSync(join(import.meta.dirname, '../../../web/src/app.css'), 'utf8'),
};

function declarations(css, selector) {
  const wanted = selector.replace(/\s+/g, ' ').trim();
  for (const [, selectors, body] of css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.replace(/\s+/g, ' ').trim() !== wanted) continue;
    return Object.fromEntries(
      body
        .split(';')
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
    );
  }
  throw new Error(`No shipping rule for ${selector}`);
}

const number = (value, pattern) => {
  const match = pattern.exec(value);
  if (!match) throw new Error(`${value} does not match ${pattern}`);
  return Number(match[1]);
};

// color-mix(in srgb, var(--brand) N%, transparent) is the brand hue at N% alpha.
function brandMix(value) {
  const shadow = /^(.*) color-mix\(in srgb, var\(--brand\) (\d+)%, transparent\)$/.exec(value);
  if (!shadow) throw new Error(`${value} is not a brand mix`);
  const [red, green, blue] = brand.brand
    .slice(1)
    .match(/../g)
    .map((pair) => Number.parseInt(pair, 16));
  return `${shadow[1]} rgba(${red}, ${green}, ${blue}, ${Number(shadow[2]) / 100})`;
}

// calc(<length or var(--token)> - var(--border-width)), resolved against the design scale.
function insetLength(value) {
  const length = (term) => {
    const token = /^var\(--([a-z0-9-]+)\)$/.exec(term);
    const key = token?.[1].replace(/-([a-z0-9])/g, (_, next) => next.toUpperCase());
    return px(key === undefined ? term : scale[key]);
  };
  const calc = /^calc\((.+) - var\(--border-width\)\)$/.exec(value);
  return calc ? length(calc[1]) - px(scale.borderWidth) : length(value);
}

// Splits a value on the spaces outside parentheses.
function terms(value) {
  const parts = [''];
  let depth = 0;
  for (const character of value) {
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;
    if (character === ' ' && depth === 0) parts.push('');
    else parts[parts.length - 1] += character;
  }
  return parts;
}

function outlinePadding(css, size) {
  const [block, inline] = terms(declarations(css, `.outline.${size}`).padding);
  return { block: insetLength(block), inline: insetLength(inline) };
}

const customProperty = (css, name) => {
  const match = new RegExp(`${name}: ([^;]+);`).exec(css);
  if (!match) throw new Error(`No shipping ${name}`);
  return match[1];
};

function shippingChrome({ button, app }) {
  const ring = declarations(button, '.ring');
  const hero = declarations(button, '.hero');
  const tile = declarations(app, '.actions-panel .action-button');
  const flyoutMenu = declarations(app, '.flyout-menu');
  const flyoutOption = declarations(app, '.flyout-option');
  const keylineSelector = (kind) =>
    `.action-button.${kind}-stroke svg path[fill='currentColor'], .brush-menu.${kind}-stroke svg path[fill='currentColor'], .stroke-width-menu.${kind}-stroke svg path:not([fill^='url'])`;
  const whiteKeyline = declarations(app, keylineSelector('white'));
  const darkKeyline = declarations(app, keylineSelector('dark'));
  return {
    BUTTON_PRESS_SCALE: number(
      declarations(button, '.btn:active:not(:disabled)').transform,
      /^scale\(([\d.]+)\)$/
    ),
    BUTTON_LG_PADDING_BLOCK_PX: number(declarations(button, '.lg').padding, /^(\d+)px /),
    BUTTON_HERO_MIN_HEIGHT_PX: number(hero['min-height'], /^(\d+)px$/),
    BUTTON_HERO_GAP_PX: number(hero.gap, /^(\d+)px$/),
    BUTTON_OUTLINE_PADDING_PX: Object.fromEntries(
      ['sm', 'md', 'lg', 'hero'].map((size) => [size, outlinePadding(button, size)])
    ),
    BUSY_RING_SIZE_PX: number(ring.width, /^(\d+)px$/),
    BUSY_RING_BORDER_PX: number(ring.border, /^(\d+)px solid currentColor$/),
    BUSY_RING_OPACITY: Number(ring.opacity),
    BUSY_RING_TURN_MS: number(ring.animation, /^spin ([\d.]+)s linear infinite$/) * 1000,
    BRAND_HERO_SHADOW: brandMix(declarations(button, '.brand.hero')['box-shadow']),
    CORNER_BUTTON_SIZE_PX: number(customProperty(app, '--corner-button-size'), /^(\d+)px$/),
    CORNER_IDLE_OPACITY: Number(declarations(app, '.corner-button').opacity),
    CORNER_HOVER_OPACITY: Number(declarations(app, '.corner-button:hover').opacity),
    CORNER_PRESSED_OPACITY: Number(declarations(app, '.corner-button:active').opacity),
    ACTION_TILE_BORDER_PX: number(tile.border, /^(\d+)px solid var\(--float-border\)$/),
    ACTION_TILE_RADIUS_RATIO: Number(customProperty(app, '--action-btn-radius-ratio')),
    ACTION_TILE_PADDING_SHARE: number(
      tile.padding,
      /^calc\(var\(--action-btn-base\) \/ (\d+) \* var\(--action-btn-scale, 1\)\)$/
    ),
    ACTION_TILE_PRESS_SCALE: number(
      declarations(app, '.actions-panel .action-button:active:not(:disabled):not(.disabled)')
        .transform,
      /^scale\(([\d.]+)\)$/
    ),
    ACTION_TILE_DISABLED_OPACITY: Number(
      declarations(
        app,
        '.actions-panel .action-button:disabled, .actions-panel .action-button.disabled'
      ).opacity
    ),
    ACTION_TILE_HOVER_SHADOW: brandMix(
      declarations(app, '.actions-panel .action-button:hover:not(:disabled):not(.disabled)')[
        'box-shadow'
      ]
    ),
    BRAND_SELECTION_RING: [
      declarations(app, '.actions-panel .action-button.active')['box-shadow'],
      declarations(app, '.flyout-option.active')['box-shadow'],
    ]
      .map(brandMix)
      .reduce((tile, option) => (tile === option ? tile : `${tile} ≠ ${option}`)),
    FLYOUT_OPTION_MIN_BASE_PX: number(
      flyoutMenu['--flyout-option-base'],
      /^max\(var\(--action-btn-base\), (\d+)px\)$/
    ),
    FLYOUT_OPTION_PADDING_PX: number(
      flyoutOption.padding,
      /^calc\((\d+)px \* var\(--action-btn-scale, 1\)\)$/
    ),
    FLYOUT_OPTION_PRESS_SCALE: number(
      declarations(app, '.flyout-option:active').transform,
      /^scale\(([\d.]+)\)$/
    ),
    FLYOUT_MENU_PADDING_PX: number(flyoutMenu['--flyout-menu-padding'], /^(\d+)px$/),
    FLYOUT_MENU_GAP_PX: number(flyoutMenu.gap, /^(\d+)px$/),
    WHITE_INK_KEYLINE: whiteKeyline.stroke,
    INK_KEYLINE_WIDTH_PX: [whiteKeyline['stroke-width'], darkKeyline['stroke-width']]
      .map((width) => number(width, /^(\d+)px$/))
      .reduce((white, dark) => (white === dark ? white : NaN)),
  };
}

const NATIVE_CHROME = {
  BUTTON_PRESS_SCALE,
  BUTTON_LG_PADDING_BLOCK_PX,
  BUTTON_HERO_MIN_HEIGHT_PX,
  BUTTON_HERO_GAP_PX,
  BUTTON_OUTLINE_PADDING_PX,
  BUSY_RING_SIZE_PX,
  BUSY_RING_BORDER_PX,
  BUSY_RING_OPACITY,
  BUSY_RING_TURN_MS,
  BRAND_HERO_SHADOW,
  CORNER_BUTTON_SIZE_PX,
  CORNER_IDLE_OPACITY,
  CORNER_HOVER_OPACITY,
  CORNER_PRESSED_OPACITY,
  ACTION_TILE_BORDER_PX,
  ACTION_TILE_RADIUS_RATIO,
  ACTION_TILE_PADDING_SHARE,
  ACTION_TILE_PRESS_SCALE,
  ACTION_TILE_DISABLED_OPACITY,
  ACTION_TILE_HOVER_SHADOW,
  BRAND_SELECTION_RING,
  FLYOUT_OPTION_MIN_BASE_PX,
  FLYOUT_OPTION_PADDING_PX,
  FLYOUT_OPTION_PRESS_SCALE,
  FLYOUT_MENU_PADDING_PX,
  FLYOUT_MENU_GAP_PX,
  WHITE_INK_KEYLINE,
  INK_KEYLINE_WIDTH_PX,
};

describe('shipping chrome drift', () => {
  it('holds every untokened chrome value to its shipping declaration', () => {
    expect(NATIVE_CHROME).toEqual(shippingChrome(SHIPPING_SOURCES));
  });

  it.each([
    ['button', 'scale(0.96)', 'scale(0.9)', 'BUTTON_PRESS_SCALE'],
    [
      'button',
      'calc(var(--space-3) - var(--border-width))',
      'var(--space-3)',
      'BUTTON_OUTLINE_PADDING_PX',
    ],
    ['app', '--brand) 35%', '--brand) 45%', 'BRAND_SELECTION_RING'],
    ['app', 'stroke: #000;', 'stroke: #111;', 'WHITE_INK_KEYLINE'],
    ['app', '--corner-button-size: 48px', '--corner-button-size: 44px', 'CORNER_BUTTON_SIZE_PX'],
  ])('fails when the shipping %s source changes %s', (source, from, to, constant) => {
    expect(SHIPPING_SOURCES[source]).toContain(from);
    const drifted = shippingChrome({
      ...SHIPPING_SOURCES,
      [source]: SHIPPING_SOURCES[source].replace(from, to),
    });
    expect(drifted[constant]).not.toEqual(NATIVE_CHROME[constant]);
  });
});
