import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_LANDSCAPE_QUERY } from './breakpoints';
import type { SafeAreaInsets } from './platform/safeArea';
import { layoutState } from './state/layout.svelte';
import { networkState } from './state/network.svelte';
import { FREE_GENERATION_LIMIT } from './freeGenerations';
import { freeGenerationsState } from './state/freeGenerations.svelte';
import {
  settingsState,
  setToolDrawerEnabled,
  setAiImage,
  setColoringBook,
  setCrayon,
  setEraser,
  setMagicBrush,
  setScreenshot,
  setStrokeWidthControl,
  setUndoButton,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
} from './state/settings.svelte';
import { selectBrush } from './state/tool.svelte';
import { PALETTE_LANDSCAPE_WIDTH_PX } from './design/trimGeometry';
import { LARGE_TABLET_MIN_SIDE_PX, TABLET_MIN_SIDE_PX } from './breakpoints';
import {
  ACTION_BUTTON_BASE_PX,
  ACTION_BUTTON_BASE_PROPERTY,
  actionButtonBase,
  actionButtonSizeClass,
  ACTION_PANEL_LIVE_ATTRIBUTE,
  CONTROL_OFF_ATTRIBUTES,
  NO_ACTIONS_ATTRIBUTE,
  SINGLE_BRUSH_ATTRIBUTE,
  PALETTE_BAR_RESERVE,
  availablePerButton,
  ACTION_BUTTON_GAP,
  ACTION_BUTTON_COUNT_PROPERTY,
  isAiImageButtonVisible,
  isAiImageButtonShown,
  layoutActionButtonCount,
  visibleActionButtonCount,
  maxActionButtonScale,
  publishActionPanelState,
  MAX_ACTION_BUTTON_COUNT,
} from './actionButtonLayout';

// The layout store measures the window, so a case describes the device it wants
// and lets the store measure it: the phone media class through a matchMedia stub,
// the insets through the safe-area probe, the rest through the window itself.
const device = vi.hoisted(() => ({
  phoneLandscape: false,
  insets: { top: 0, right: 0, bottom: 0, left: 0 } as SafeAreaInsets,
}));

vi.mock('./platform/safeArea', () => ({
  ZERO_INSETS: { top: 0, right: 0, bottom: 0, left: 0 },
  measureSafeAreaInsets: (): SafeAreaInsets => ({ ...device.insets }),
}));

function setViewport(width: number, height: number, phoneLandscape = false) {
  device.phoneLandscape = phoneLandscape;
  window.innerWidth = width;
  window.innerHeight = height;
  window.dispatchEvent(new Event('resize'));
}

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === PHONE_LANDSCAPE_QUERY ? device.phoneLandscape : false;
    },
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  // The singleton installed at import against the real matchMedia; re-install it
  // on the stub so the phone class follows the case.
  layoutState.dispose();
  layoutState.install();
});

function resetState() {
  setToolDrawerEnabled(true);
  setStrokeWidthControl(true);
  setCrayon(true);
  setMagicBrush(true);
  setEraser(true);
  setColoringBook(true);
  setScreenshot(true);
  setUndoButton(true);
  setAiImage(true);
  settingsState.mirrorAiAccessToken('');
  settingsState.mirrorAiUserApiKey('');
  networkState.setOnline(true);
  freeGenerationsState.setFreeGenerationsRemaining(FREE_GENERATION_LIMIT);

  device.insets = { top: 0, right: 0, bottom: 0, left: 0 };
  setViewport(1280, 800);
}

beforeEach(resetState);

describe('visibleActionButtonCount', () => {
  it.each([
    { credentialState: 'neither credential', apiKey: '', accessCode: '' },
    { credentialState: 'a BYO key only', apiKey: 'key', accessCode: '' },
    { credentialState: 'an access code only', apiKey: '', accessCode: 'code' },
    { credentialState: 'both credentials', apiKey: 'key', accessCode: 'code' },
  ])(
    'keeps layout counting in sync with visibility for $credentialState',
    ({ apiKey, accessCode }) => {
      settingsState.mirrorAiUserApiKey(apiKey);
      settingsState.mirrorAiAccessToken(accessCode);

      expect(isAiImageButtonVisible()).toBe(true);
      expect(visibleActionButtonCount()).toBe(6);
    }
  );

  it('requires the AI toggle and connectivity even with a credential', () => {
    settingsState.mirrorAiUserApiKey('key');
    expect(visibleActionButtonCount()).toBe(6);

    networkState.setOnline(false);
    expect(isAiImageButtonVisible()).toBe(false);
    expect(visibleActionButtonCount()).toBe(5);

    networkState.setOnline(true);
    setAiImage(false);
    expect(isAiImageButtonVisible()).toBe(false);
    expect(visibleActionButtonCount()).toBe(5);
  });

  it('requires a usable free-generation path when no credential is saved', () => {
    freeGenerationsState.setFreeGenerationsUnavailable();
    expect(isAiImageButtonVisible()).toBe(false);
    expect(visibleActionButtonCount()).toBe(5);

    settingsState.mirrorAiAccessToken('code');
    expect(isAiImageButtonVisible()).toBe(true);
    expect(visibleActionButtonCount()).toBe(6);
  });

  it('drops buttons the parent switched off', () => {
    setStrokeWidthControl(false);
    setUndoButton(false);
    expect(visibleActionButtonCount()).toBe(4);
  });

  it('keeps the brush control while any optional brush remains enabled', () => {
    setCrayon(false);
    setMagicBrush(false);
    expect(visibleActionButtonCount()).toBe(6);
  });

  it('drops the brush control when every optional brush is disabled', () => {
    setCrayon(false);
    setMagicBrush(false);
    setEraser(false);
    expect(visibleActionButtonCount()).toBe(5);
  });

  it('reaches zero when every first-paint action is disabled', () => {
    freeGenerationsState.setFreeGenerationsUnavailable();
    setCrayon(false);
    setMagicBrush(false);
    setEraser(false);
    setStrokeWidthControl(false);
    setColoringBook(false);
    setScreenshot(false);
    setUndoButton(false);
    expect(visibleActionButtonCount()).toBe(0);
  });

  it('all-on count equals MAX_ACTION_BUTTON_COUNT', () => {
    settingsState.mirrorAiAccessToken('tok');
    expect(visibleActionButtonCount()).toBe(MAX_ACTION_BUTTON_COUNT);
  });
});

describe('layoutActionButtonCount', () => {
  it('shows a disabled AI button while online even after the grant fails', () => {
    freeGenerationsState.setFreeGenerationsUnavailable();
    expect(visibleActionButtonCount()).toBe(5);
    expect(isAiImageButtonShown()).toBe(true);
    expect(layoutActionButtonCount()).toBe(6);

    freeGenerationsState.setFreeGenerationsRemaining(FREE_GENERATION_LIMIT);
    expect(visibleActionButtonCount()).toBe(6);
    expect(layoutActionButtonCount()).toBe(6);

    networkState.setOnline(false);
    expect(isAiImageButtonShown()).toBe(false);
    expect(layoutActionButtonCount()).toBe(5);

    networkState.setOnline(true);
    expect(isAiImageButtonShown()).toBe(true);
    expect(layoutActionButtonCount()).toBe(6);
  });

  it('does not show AI when the parent switched it off', () => {
    freeGenerationsState.setFreeGenerationsUnavailable();
    setAiImage(false);
    expect(isAiImageButtonShown()).toBe(false);
    expect(layoutActionButtonCount()).toBe(5);
  });
});

describe('availablePerButton', () => {
  it('clears the declared landscape palette column', () => {
    setViewport(1024, 800);
    expect(availablePerButton(5)).toBe((1024 - PALETTE_LANDSCAPE_WIDTH_PX - 128 - 48) / 5);
  });

  it('removes the palette reserve on landscape phones', () => {
    setViewport(667, 375, true);
    expect(availablePerButton(5)).toBe((667 - 128 - 48) / 5);
  });

  it('keeps the palette reserve when visible height is phone-sized but CSS is tablet-sized', () => {
    setViewport(1024, 550);
    expect(availablePerButton(5)).toBe((1024 - PALETTE_LANDSCAPE_WIDTH_PX - 128 - 48) / 5);
  });

  it('clears the declared portrait palette bar', () => {
    setViewport(390, 844);
    expect(availablePerButton(5)).toBe((844 - PALETTE_BAR_RESERVE - 72 - 48) / 5);
  });
});

describe('maxActionButtonScale', () => {
  it('returns the static max when the screen has room to spare', () => {
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('keeps the row size ceiling when CSS is tablet-sized behind browser chrome', () => {
    setViewport(650, 550);
    expect(maxActionButtonScale()).toBe(116);
  });

  it('allows the full slider range on a landscape phone', () => {
    setViewport(600, 375, true);
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('never drops below the slider minimum', () => {
    setViewport(520, 160, true);
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MIN);
  });

  it('uses the vertical budget and the portrait base in portrait', () => {
    setViewport(360, 440);
    // (440 − 75 − 8 − 124) / 6 = 38.83px per button → 77% of the phone base.
    expect(maxActionButtonScale()).toBe(77);
  });

  it('portrait tall screens clear the static max', () => {
    setViewport(360, 740);
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('uses the declared portrait bar the moment the orientation flips', () => {
    setViewport(768, 1024);
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('retains the full slider range when phone controls are switched off', () => {
    setViewport(600, 375, true);
    setScreenshot(false);
    setUndoButton(false);
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('budgets for the free AI button without a credential', () => {
    setViewport(680, 360, true);
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('subtracts safe-area insets from the budget', () => {
    device.insets = { top: 20, right: 0, bottom: 20, left: 0 };
    setViewport(667, 250, true);
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MIN);
  });
});

// The slider's own range never moves — every screen opens at
// ACTION_BUTTON_SCALE_DEFAULT with the same travel either way. What the size
// class changes is what that centre is worth in pixels.
describe('action button size class', () => {
  it.each([
    { name: 'a small phone', shorterSidePx: 375, expected: 'phone' },
    { name: 'the largest phone', shorterSidePx: 440, expected: 'phone' },
    { name: 'the tablet floor', shorterSidePx: TABLET_MIN_SIDE_PX, expected: 'tablet' },
    { name: 'an 11-inch tablet', shorterSidePx: 834, expected: 'tablet' },
    {
      name: 'the large-tablet floor',
      shorterSidePx: LARGE_TABLET_MIN_SIDE_PX,
      expected: 'largeTablet',
    },
    { name: 'a 13-inch tablet', shorterSidePx: 1032, expected: 'largeTablet' },
  ])('classifies $name by its shorter side', ({ shorterSidePx, expected }) => {
    expect(actionButtonSizeClass(shorterSidePx)).toBe(expected);
  });

  it('keeps its step through a rotation', () => {
    setViewport(1376, 1032);
    expect(actionButtonBase('landscape')).toBe(ACTION_BUTTON_BASE_PX.largeTablet.landscape);

    setViewport(1032, 1376);
    expect(actionButtonBase('portrait')).toBe(ACTION_BUTTON_BASE_PX.largeTablet.portrait);
  });

  it('shrinks on a phone and grows on a large tablet, either way round', () => {
    for (const orientation of ['landscape', 'portrait'] as const) {
      expect(ACTION_BUTTON_BASE_PX.phone[orientation]).toBeLessThan(
        ACTION_BUTTON_BASE_PX.tablet[orientation]
      );
      expect(ACTION_BUTTON_BASE_PX.largeTablet[orientation]).toBeGreaterThan(
        ACTION_BUTTON_BASE_PX.tablet[orientation]
      );
    }
  });

  // What each step is worth to a two-year-old's finger — at the slider default
  // and at its minimum — is actionButtonLayout.touchTargets.test.ts.
});

// The render cap is app.css's --action-btn-size formula and the slider ceiling
// is availablePerButton: one budget, two homes. Evaluating the committed CSS
// with both safe-area insets at zero — as the fixtures' layout state has them —
// and --action-btn-scale at 1 has to land on exactly the number the ceiling
// reports, for the landscape formula and the portrait one alike.
const CSS_TOKEN_PATTERN = /min|calc|[-+*/(),]|\d+(?:\.\d+)?/g;

/** The value of `property` in `css`, balanced across nested parentheses. */
function cssValue(css: string, property: string): string {
  const at = css.indexOf(`${property}:`);
  expect(at, `expected \`${property}\` in the block`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = at + property.length + 1; i < css.length; i++) {
    if (css[i] === '(') depth += 1;
    else if (css[i] === ')') depth -= 1;
    else if (css[i] === ';' && depth === 0) return css.slice(at + property.length + 1, i).trim();
  }
  throw new Error(`unterminated \`${property}\``);
}

interface FormulaInputs {
  viewportWidth: number;
  viewportHeight: number;
  basePx: number;
  buttonCount: number;
  paletteLandscapeWidth: number;
}

function tokenizeCssLength(expr: string, inputs: FormulaInputs): string[] {
  const resolved = expr
    .replace(/var\(--safe-area-\w+\)/g, '0px')
    .replace('var(--action-btn-scale, 1)', '1')
    .replace(`var(${ACTION_BUTTON_BASE_PROPERTY})`, `${inputs.basePx}px`)
    .replace('100vw', `${inputs.viewportWidth}px`)
    .replace('100dvh', `${inputs.viewportHeight}px`)
    .replace('var(--palette-landscape-width)', `${inputs.paletteLandscapeWidth}px`)
    .replace('var(--palette-portrait-height)', `${PALETTE_BAR_RESERVE}px`)
    .replace('var(--action-btn-gap-total)', `(${(inputs.buttonCount - 1) * ACTION_BUTTON_GAP}px)`)
    .replace(`var(${ACTION_BUTTON_COUNT_PROPERTY})`, String(inputs.buttonCount))
    .replace(/px\b/g, '');
  expect(resolved, `unresolved var() in ${resolved}`).not.toContain('var(');
  return resolved.match(CSS_TOKEN_PATTERN) ?? [];
}

// Recursive descent over the CSS subset the formula uses: min(), calc(),
// px lengths, and the four arithmetic operators.
function evaluateCssLength(expr: string, inputs: FormulaInputs): number {
  const tokens = tokenizeCssLength(expr, inputs);
  let index = 0;

  function operand(): number {
    const token = tokens[index++];
    if (token === 'min') {
      index++;
      const operands = [sum()];
      while (tokens[index] === ',') {
        index++;
        operands.push(sum());
      }
      index++;
      return Math.min(...operands);
    }
    if (token === 'calc') index++;
    if (token === 'calc' || token === '(') {
      const grouped = sum();
      index++;
      return grouped;
    }
    return Number(token);
  }

  function product(): number {
    let result = operand();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      result = operator === '*' ? result * operand() : result / operand();
    }
    return result;
  }

  function sum(): number {
    let result = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      result = operator === '+' ? result + product() : result - product();
    }
    return result;
  }

  return sum();
}

const appCss = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

/** The `.actions-panel { … }` block that carries the formula for an orientation. */
function sizeFormula(orientation: 'landscape' | 'portrait'): string {
  const from =
    orientation === 'portrait'
      ? appCss.indexOf('@media (orientation: portrait) {\n  .actions-panel {')
      : appCss.indexOf('\n.actions-panel {');
  expect(from, `app.css has no ${orientation} .actions-panel formula block`).toBeGreaterThan(-1);
  return cssValue(appCss.slice(from), '--action-btn-size');
}

const BUTTON_SIZE_FIXTURES = [
  {
    name: 'roomy landscape tablet',
    orientation: 'landscape',
    viewportWidth: 1280,
    viewportHeight: 800,
    buttonCount: 5,
    budgetWins: false,
  },
  // Landscape-shaped, since the store derives orientation from the viewport, and
  // tall enough (height at the tablet floor) that the phone-landscape media query
  // real CSS applies would not match either.
  {
    name: 'narrow landscape tablet with every button',
    orientation: 'landscape',
    viewportWidth: 620,
    viewportHeight: 600,
    buttonCount: 6,
    budgetWins: true,
  },
  {
    name: 'tall portrait phone',
    orientation: 'portrait',
    viewportWidth: 390,
    viewportHeight: 844,
    buttonCount: 5,
    budgetWins: false,
  },
  {
    name: 'short portrait phone with every button',
    orientation: 'portrait',
    viewportWidth: 360,
    viewportHeight: 440,
    buttonCount: 6,
    budgetWins: true,
  },
] as const;

describe('the app.css --action-btn-size formula', () => {
  it.each(BUTTON_SIZE_FIXTURES)(
    'resolves to the same cap as the slider ceiling budget on a $name',
    (fixture) => {
      setViewport(fixture.viewportWidth, fixture.viewportHeight);
      expect(layoutState.orientation).toBe(fixture.orientation);

      const { buttonCount } = fixture;
      const basePx = actionButtonBase(fixture.orientation);
      const available = availablePerButton(buttonCount);

      expect(available < basePx).toBe(fixture.budgetWins);
      expect(
        evaluateCssLength(sizeFormula(fixture.orientation), {
          viewportWidth: fixture.viewportWidth,
          viewportHeight: fixture.viewportHeight,
          basePx,
          buttonCount,
          paletteLandscapeWidth: PALETTE_LANDSCAPE_WIDTH_PX,
        })
      ).toBeCloseTo(Math.min(basePx, available));
    }
  );
});

// The publish contract mirrors the app.html seed script and BOOL_SETTINGS: an
// attribute is present only when the value DEVIATES from the default, so the raw
// prerendered HTML (no attributes) already renders the defaults. These tests pin
// that polarity so a drifting key or inverted default is caught here.
describe('publishActionPanelState', () => {
  it('writes no deviation attributes and clears the brush at the defaults', () => {
    selectBrush('pen');
    const el = document.createElement('div');
    el.setAttribute('data-brush', 'stale'); // proves the pen default clears it

    publishActionPanelState(el, false, 1);

    expect(el.style.getPropertyValue('--action-btn-scale')).toBe('1');
    expect(el.style.getPropertyValue(ACTION_BUTTON_COUNT_PROPERTY)).toBe(
      String(MAX_ACTION_BUTTON_COUNT)
    );
    expect(el.hasAttribute(ACTION_PANEL_LIVE_ATTRIBUTE)).toBe(true);
    expect(el.hasAttribute('data-drawer-open')).toBe(false);
    expect(el.hasAttribute(SINGLE_BRUSH_ATTRIBUTE)).toBe(false);
    expect(el.hasAttribute(NO_ACTIONS_ATTRIBUTE)).toBe(false);
    for (const attr of Object.values(CONTROL_OFF_ATTRIBUTES)) {
      expect(el.hasAttribute(attr)).toBe(false);
    }
    expect(el.hasAttribute('data-brush')).toBe(false);
  });

  it('marks the drawer open and publishes the scale from the arguments', () => {
    const el = document.createElement('div');
    publishActionPanelState(el, true, 1.3);
    expect(el.hasAttribute('data-drawer-open')).toBe(true);
    expect(el.style.getPropertyValue('--action-btn-scale')).toBe('1.3');
  });

  it('stamps data-off-<control> only for controls switched off', () => {
    setStrokeWidthControl(false);
    setUndoButton(false);
    const el = document.createElement('div');
    publishActionPanelState(el, false, 1);
    expect(el.hasAttribute('data-off-stroke')).toBe(true);
    expect(el.hasAttribute('data-off-undo')).toBe(true);
    expect(el.hasAttribute('data-off-coloring')).toBe(false);
  });

  it('stamps every data-off-<control> when all controls are switched off', () => {
    setStrokeWidthControl(false);
    setCrayon(false);
    setMagicBrush(false);
    setEraser(false);
    setColoringBook(false);
    setScreenshot(false);
    setUndoButton(false);
    const el = document.createElement('div');
    publishActionPanelState(el, false, 1);
    for (const attr of Object.values(CONTROL_OFF_ATTRIBUTES)) {
      expect(el.hasAttribute(attr)).toBe(true);
    }
  });

  it('publishes a single optional brush for the direct-button presentation', () => {
    setCrayon(false);
    setMagicBrush(false);
    const el = document.createElement('div');
    publishActionPanelState(el, false, 1);
    expect(el.getAttribute(SINGLE_BRUSH_ATTRIBUTE)).toBe('eraser');
  });

  it('hides an empty panel and shows a disabled AI-only panel when online', () => {
    freeGenerationsState.setFreeGenerationsUnavailable();
    setCrayon(false);
    setMagicBrush(false);
    setEraser(false);
    setStrokeWidthControl(false);
    setColoringBook(false);
    setScreenshot(false);
    setUndoButton(false);
    networkState.setOnline(false);
    const el = document.createElement('div');
    publishActionPanelState(el, false, 1);
    expect(el.hasAttribute(NO_ACTIONS_ATTRIBUTE)).toBe(true);

    networkState.setOnline(true);
    publishActionPanelState(el, false, 1);
    expect(el.hasAttribute(NO_ACTIONS_ATTRIBUTE)).toBe(false);
    expect(el.style.getPropertyValue(ACTION_BUTTON_COUNT_PROPERTY)).toBe('1');
  });

  it('reflects each non-pen brush in data-brush', () => {
    for (const brush of ['crayon', 'magic', 'eraser'] as const) {
      selectBrush(brush);
      const el = document.createElement('div');
      publishActionPanelState(el, false, 1);
      expect(el.getAttribute('data-brush')).toBe(brush);
    }
    selectBrush('pen');
  });
});
