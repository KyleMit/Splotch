import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { scale } from '../../../web/src/lib/design/tokens.ts';
import {
  CSS_EASE,
  CSS_EASE_REVERSED,
  DIALOG_BACK_PADDING_PX,
  EASE_GLIDE,
  FLY_BACK_REACH,
  FLY_BACK_SCALE,
  FLY_IN_DURATION_MS,
  FLY_IN_OPACITY,
  FLY_IN_TRANSFORM,
  MODAL_CLOSE_BORDER_PX,
  MODAL_CLOSE_INSET_PX,
  MODAL_CLOSE_PADDING_PX,
  MODAL_CONTROL_PRESSED_SCALE,
  MODAL_CONTROL_SIZE_PX,
  MODAL_EXIT_MS,
  MODAL_FADE_MS,
  MODAL_GUTTER_MIN_PX,
  MODAL_SCRIM_BLUR_PX,
  MODAL_SCRIM_FROSTED,
  MODAL_SCRIM_PLAIN,
  modalFrame,
} from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';
import { blobPath } from '../../../experiments/native-architecture/src/rsdDrawing/blob.ts';

vi.mock('react-strict-dom', () => ({
  css: { defineVars: (vars) => vars, createTheme: (_vars, overrides) => overrides },
}));

const read = (path) => readFileSync(new URL(`../../../web/src/${path}`, import.meta.url), 'utf8');
const APP_CSS = read('app.css');
const SETTINGS = read('lib/components/SettingsModal.svelte');
const GATE = read('lib/components/ParentalGate.svelte');
const HEADER = read('lib/components/design/DialogHeader.svelte');

// The declarations of the first `selector {` rule after `from` (a media query, say).
function rule(source, selector, from = '') {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThanOrEqual(0);
  const open = source.indexOf(`${selector} {`, start);
  expect(open, `${from} ${selector}`).toBeGreaterThanOrEqual(0);
  return source.slice(open, source.indexOf('}', open));
}

function declaration(block, property) {
  const value = new RegExp(`\\n\\s*${property}: ([^;]+);`).exec(block)?.[1];
  expect(value, property).toBeDefined();
  return value;
}

function px(value) {
  const token = /^var\(--space-(\d)\)$/.exec(value);
  const length = token ? scale[`space${token[1]}`] : value;
  expect(length, value).toMatch(/^(?:0|\d+px)$/);
  return Number.parseFloat(length);
}

// A CSS padding shorthand as the frame's top / inline / bottom box.
function box(shorthand) {
  const [top, inline = top, bottom = top] = shorthand.split(/\s+(?![^(]*\))/).map(px);
  return { top, inline, bottom };
}

const maxWidth = (block) => px(declaration(block, 'max-width'));
const slash = (rgba) => {
  const [r, g, b, a] = /rgba\(([^)]+)\)/.exec(rgba)[1].split(',').map(Number);
  return `rgb(${r} ${g} ${b} / ${Math.round(a * 100)}%)`;
};

const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const TABLET = { width: 834, height: 1194 };
const LARGE_TABLET = { width: 1366, height: 1024 };
const SHORT_WIDE = { width: 800, height: 700 };
const ROOMY_PHONE = { width: 600, height: 900 };
const GUTTER = MODAL_GUTTER_MIN_PX;

describe('the shipping modal frame', () => {
  it('dims with the shipping scrim, frosted where it can blur and plain where it cannot', () => {
    const backdrop = rule(APP_CSS, '.modal-dialog::backdrop');
    expect(declaration(backdrop, 'background')).toBe(slash(MODAL_SCRIM_FROSTED));
    expect(declaration(backdrop, 'backdrop-filter')).toBe(`blur(${MODAL_SCRIM_BLUR_PX}px)`);
    const plain = rule(
      APP_CSS,
      '.modal-dialog::backdrop',
      '@media (prefers-reduced-transparency: reduce)'
    );
    expect(declaration(plain, 'background')).toBe(slash(MODAL_SCRIM_PLAIN));
  });

  it('keeps the gutter, close disc and back blob at their shipping sizes', () => {
    expect(APP_CSS).toContain(`--modal-gutter-min: ${MODAL_GUTTER_MIN_PX}px;`);
    expect(APP_CSS).toContain(`--touch-target-min: ${MODAL_CONTROL_SIZE_PX}px;`);
    expect(APP_CSS).toContain('--modal-close-size: var(--touch-target-min);');
    expect(px(/--modal-close-inset: ([^;]+);/.exec(APP_CSS)[1])).toBe(MODAL_CLOSE_INSET_PX);
    const disc = rule(APP_CSS, ':is(.modal-close-btn, .dialog-header-control, .banner-dismiss)');
    expect(declaration(disc, 'border')).toBe(`${MODAL_CLOSE_BORDER_PX}px solid var(--border-warm)`);
    expect(declaration(disc, 'border-radius')).toBe('var(--radius-blob-2)');
    expect(px(declaration(disc, 'padding'))).toBe(MODAL_CLOSE_PADDING_PX);
    const pressed = rule(
      APP_CSS,
      ':is(.modal-close-btn, .dialog-header-control, .banner-dismiss):active'
    );
    expect(declaration(pressed, 'transform')).toBe(`scale(${MODAL_CONTROL_PRESSED_SCALE})`);
    const back = rule(HEADER, '.dialog-back');
    expect(px(declaration(back, 'padding'))).toBe(DIALOG_BACK_PADDING_PX);
    expect(declaration(back, 'border-radius')).toBe('var(--radius-blob-1)');
    expect(declaration(back, 'background')).toBe('var(--brand-wash)');
  });

  it('flies in along dialogFlyFromOrigin and back along dialogFlyBack', () => {
    expect(APP_CSS).toContain(`animation: dialogFlyFromOrigin ${FLY_IN_DURATION_MS}ms linear;`);
    const keyframes = APP_CSS.slice(APP_CSS.indexOf('@keyframes dialogFlyFromOrigin'));
    const frames = Object.fromEntries(
      [...keyframes.slice(0, keyframes.indexOf('\n}\n')).matchAll(/(\d+)% \{([^}]+)\}/g)].map(
        ([, at, body]) => [Number(at) / 100, body]
      )
    );
    const translate = (reach) =>
      reach === 0
        ? 'translate(-50%, -50%)'
        : `var(--origin-x, 0px)${reach === 1 ? '' : ` * ${reach}`})`;
    for (const frame of FLY_IN_TRANSFORM) {
      expect(frames[frame.at]).toContain(translate(frame.reach));
      expect(frames[frame.at]).toContain(`scale(${frame.scale})`);
    }
    for (const frame of FLY_IN_OPACITY)
      expect(frames[frame.at]).toContain(`opacity: ${frame.opacity};`);
    for (const frame of [...FLY_IN_TRANSFORM, ...FLY_IN_OPACITY].filter(({ easing }) => easing))
      expect(frames[frame.at]).toContain(`cubic-bezier(${frame.easing.join(', ')})`);
    const back = APP_CSS.slice(APP_CSS.indexOf('@keyframes dialogFlyBack'));
    expect(back.slice(0, back.indexOf('\n}\n'))).toMatch(
      new RegExp(`\\* ${FLY_BACK_REACH}\\)[\\s\\S]*scale\\(${FLY_BACK_SCALE}\\)`)
    );
    expect(APP_CSS).toContain('animation: dialogFlyBack var(--duration-exit) var(--ease-glide)');
    expect(APP_CSS).toContain('animation: modalFadeIn var(--duration-base) ease both;');
    expect(APP_CSS).toContain('animation: modalFadeIn var(--duration-exit) ease reverse forwards;');
    expect(scale.durationBase).toBe(`${MODAL_FADE_MS / 1000}s`);
    expect(scale.durationExit).toBe(`${MODAL_EXIT_MS / 1000}s`);
    expect(scale.easeGlide).toBe(`cubic-bezier(${EASE_GLIDE.join(', ')})`);
    const [x1, y1, x2, y2] = CSS_EASE;
    expect(CSS_EASE_REVERSED).toEqual([1 - x2, 1 - y2, 1 - x1, 1 - y1]);
  });

  it('caps Settings at its phone, landscape-phone and wide shell widths and heights', () => {
    const card = rule(SETTINGS, '.settings-modal', '<style>');
    const cap = Number.parseFloat(/--card-height-cap: (\d+)vh;/.exec(card)[1]) / 100;
    const ceiling = px(/--wide-card-height-ceiling: ([^;]+);/.exec(card)[1]);
    expect(modalFrame('settings', PHONE, GUTTER)).toMatchObject({
      width: PHONE.width - 2 * GUTTER,
      maxHeight: PHONE.height * cap,
      height: null,
    });
    expect(modalFrame('settings', ROOMY_PHONE, GUTTER).width).toBe(maxWidth(card));
    expect(modalFrame('sheet', LARGE_TABLET, GUTTER).width).toBe(maxWidth(card));
    expect(modalFrame('settings', LARGE_TABLET, GUTTER)).toMatchObject({
      width: maxWidth(rule(SETTINGS, '.settings-modal.wide', '<style>')),
      height: ceiling,
    });
    expect(modalFrame('settings', SHORT_WIDE, GUTTER).height).toBe(SHORT_WIDE.height * cap);
    expect(modalFrame('settings', PHONE_LANDSCAPE, GUTTER).width).toBe(
      maxWidth(rule(SETTINGS, '.settings-modal.compact', '<style>'))
    );
  });

  it('pads the Settings header and scroll as the shipping card does on narrow and roomy phones', () => {
    const narrow = '@media (max-width: 480px)';
    const roomy = modalFrame('sheet', ROOMY_PHONE, GUTTER);
    expect(roomy.header).toEqual(
      box(declaration(rule(SETTINGS, '.settings-header', '<style>'), 'padding'))
    );
    expect(roomy.body).toEqual(
      box(declaration(rule(SETTINGS, '.settings-scroll', '<style>'), 'padding'))
    );
    const phone = modalFrame('sheet', PHONE, GUTTER);
    expect(phone.header).toEqual(
      box(declaration(rule(SETTINGS, '.settings-header', narrow), 'padding'))
    );
    expect(phone.body).toEqual(
      box(declaration(rule(SETTINGS, '.settings-scroll', narrow), 'padding'))
    );
  });

  it.each([
    ['phone', PHONE, '<style>'],
    [
      'landscape phone',
      PHONE_LANDSCAPE,
      '@media (orientation: landscape) and (max-height: 599.98px)',
    ],
    ['tablet', TABLET, '@media (min-width: 600px) and (min-height: 600px)'],
    ['large tablet', LARGE_TABLET, '@media (min-width: 1000px) and (min-height: 1000px)'],
  ])('sizes and pads the parental gate as shipping does on a %s', (_, window, media) => {
    const frame = modalFrame('gate', window, GUTTER);
    expect(frame.width).toBe(maxWidth(rule(GATE, '.parental-gate', media)));
    expect(frame.body).toEqual(box(declaration(rule(GATE, '.gate-content', media), 'padding')));
  });

  it('sizes and pads the confirm card as shipping does', () => {
    const frame = modalFrame('confirm', LARGE_TABLET, GUTTER);
    expect(frame.width).toBe(maxWidth(rule(APP_CSS, '.confirm-card')));
    expect(frame.body).toEqual(box(declaration(rule(APP_CSS, '.confirm-card-content'), 'padding')));
  });
});

describe('blobPath inset for the outlined close blob', () => {
  it('draws the outline unchanged with no inset', () => {
    expect(blobPath('radiusBlob2', 48, 48, 0)).toBe(blobPath('radiusBlob2', 48, 48));
  });

  it('keeps each corner elliptical from the shipping horizontal and vertical radii', () => {
    const path = blobPath('radiusBlob1', 48, 48);
    expect(path).toMatch(/^M27\.84 0 /);
    expect(path).toContain('A20.16 27.84 0 0 1 48 27.84');
    expect(path).toContain('A27.84 21.6 0 0 1 27.84 0');
  });

  it('moves the outline in by the inset and shrinks every radius by it', () => {
    const path = blobPath('radiusBlob2', 48, 48, 1);
    // The right side's vertical radii (45% + 58%) overrun the height, so every radius first
    // shrinks by 48 / 49.44, as CSS does, then by the 1px inset.
    expect(path).toMatch(/^M20\.971 1 H22\.369 A24\.631 19\.971 0 0 1 47 20\.971 /);
    expect(path).toMatch(/Z$/);
  });
});
