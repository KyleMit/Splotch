import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { layout } from './state/layout.svelte';
import { network } from './state/network.svelte';
import { freeGenerations } from './state/freeGenerations.svelte';
import {
  settings,
  setAdvancedControls,
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
import {
  landscapeSingleColumnMediaQuery,
  PALETTE_LANDSCAPE_WIDTHS_PX,
} from './design/trimGeometry';
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
  buttonSizeCssExpr,
  isAiImageButtonVisible,
  visibleActionButtonCount,
  resolvedLandscapePaletteWidth,
  resolvedPortraitPaletteHeight,
  maxActionButtonScale,
  publishActionPanelState,
  MAX_ACTION_BUTTON_COUNT,
} from './actionButtonLayout';

const originalMatchMedia = window.matchMedia;
let singleColumnMediaMatches = false;

function mediaQueryList(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

function resetState() {
  setAdvancedControls(true);
  setStrokeWidthControl(true);
  setCrayon(true);
  setMagicBrush(true);
  setEraser(true);
  setColoringBook(true);
  setScreenshot(true);
  setUndoButton(true);
  setAiImage(true);
  settings.aiAccessToken = '';
  settings.aiUserApiKey = '';
  network.online = true;
  freeGenerations.available = true;

  layout.orientation = 'landscape';
  layout.viewportWidth = 1280;
  layout.viewportHeight = 800;
  layout.paletteMeasurement = { width: 156, height: 76, orientation: 'landscape' };
  Object.assign(layout.safeArea, { top: 0, right: 0, bottom: 0, left: 0 });

  singleColumnMediaMatches = false;
  window.matchMedia = vi.fn((query: string) =>
    mediaQueryList(query, query === landscapeSingleColumnMediaQuery() && singleColumnMediaMatches)
  );
}

beforeEach(resetState);
afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

describe('visibleActionButtonCount', () => {
  it.each([
    { credentialState: 'neither credential', apiKey: '', accessCode: '' },
    { credentialState: 'a BYO key only', apiKey: 'key', accessCode: '' },
    { credentialState: 'an access code only', apiKey: '', accessCode: 'code' },
    { credentialState: 'both credentials', apiKey: 'key', accessCode: 'code' },
  ])(
    'keeps layout counting in sync with visibility for $credentialState',
    ({ apiKey, accessCode }) => {
      settings.aiUserApiKey = apiKey;
      settings.aiAccessToken = accessCode;

      expect(isAiImageButtonVisible()).toBe(true);
      expect(visibleActionButtonCount()).toBe(6);
    }
  );

  it('requires the AI toggle and connectivity even with a credential', () => {
    settings.aiUserApiKey = 'key';
    expect(visibleActionButtonCount()).toBe(6);

    network.online = false;
    expect(isAiImageButtonVisible()).toBe(false);
    expect(visibleActionButtonCount()).toBe(5);

    network.online = true;
    setAiImage(false);
    expect(isAiImageButtonVisible()).toBe(false);
    expect(visibleActionButtonCount()).toBe(5);
  });

  it('requires a usable free-generation path when no credential is saved', () => {
    freeGenerations.available = false;
    expect(isAiImageButtonVisible()).toBe(false);
    expect(visibleActionButtonCount()).toBe(5);

    settings.aiAccessToken = 'code';
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
    freeGenerations.available = false;
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
    settings.aiAccessToken = 'tok';
    expect(visibleActionButtonCount()).toBe(MAX_ACTION_BUTTON_COUNT);
  });
});

describe('resolvedLandscapePaletteWidth', () => {
  it('uses the two-column media-query geometry before the palette measures', () => {
    layout.paletteMeasurement = { width: 0, height: 0, orientation: null };
    layout.viewportHeight = 768;
    expect(resolvedLandscapePaletteWidth()).toBe(PALETTE_LANDSCAPE_WIDTHS_PX.twoColumns);
  });

  it('uses the single-column media-query geometry instead of visible viewport height', () => {
    layout.paletteMeasurement = { width: 0, height: 0, orientation: null };
    layout.viewportHeight = 375;
    singleColumnMediaMatches = true;
    expect(resolvedLandscapePaletteWidth()).toBe(PALETTE_LANDSCAPE_WIDTHS_PX.singleColumn);
  });

  it('keeps the measured width as the hydrated correction', () => {
    layout.paletteMeasurement = { width: 84.5, height: 768, orientation: 'landscape' };
    expect(resolvedLandscapePaletteWidth()).toBe(84.5);
  });

  it('ignores a portrait measurement after rotating to landscape', () => {
    layout.paletteMeasurement = { width: 375, height: 76, orientation: 'portrait' };
    expect(resolvedLandscapePaletteWidth()).toBe(PALETTE_LANDSCAPE_WIDTHS_PX.twoColumns);
  });
});

describe('resolvedPortraitPaletteHeight', () => {
  it('keeps the measured height as the hydrated correction', () => {
    layout.orientation = 'portrait';
    layout.paletteMeasurement = { width: 768, height: 76.5, orientation: 'portrait' };
    expect(resolvedPortraitPaletteHeight()).toBe(76.5);
  });

  it('ignores a landscape measurement after rotating to portrait', () => {
    layout.orientation = 'portrait';
    layout.paletteMeasurement = { width: 84, height: 768, orientation: 'landscape' };
    expect(resolvedPortraitPaletteHeight()).toBe(PALETTE_BAR_RESERVE);
  });
});

// Landscape budget: viewportWidth − palette width − 64 (reserve for the Settings
// Button) − side insets − (8 inset + 8 margin + 48 toggle + gaps). Portrait
// swaps in viewportHeight − measured palette height − 8 clearance − vertical insets.
describe('maxActionButtonScale', () => {
  it('returns the static max when the screen has room to spare', () => {
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('caps below 100% on a small landscape phone', () => {
    layout.viewportWidth = 600;
    layout.viewportHeight = 375;
    // (600 − 156 − 64 − 124) / 6 = 42.67px per button → 79% of the phone base.
    expect(maxActionButtonScale()).toBe(79);
  });

  it('never drops below the slider minimum', () => {
    layout.viewportWidth = 520;
    layout.viewportHeight = 320;
    // 29.33px per button would be 54% — clamped to the static minimum.
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MIN);
  });

  it('uses the vertical budget and the portrait base in portrait', () => {
    layout.orientation = 'portrait';
    layout.viewportWidth = 360;
    layout.viewportHeight = 440;
    // (440 − 76 − 8 − 124) / 6 = 38.67px per button → 77% of the phone base.
    expect(maxActionButtonScale()).toBe(77);
  });

  it('portrait tall screens clear the static max', () => {
    layout.orientation = 'portrait';
    layout.viewportWidth = 360;
    layout.viewportHeight = 740;
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('uses portrait fallback geometry immediately after rotating from landscape', () => {
    layout.orientation = 'portrait';
    layout.viewportWidth = 768;
    layout.viewportHeight = 1024;
    layout.paletteMeasurement = { width: 84, height: 768, orientation: 'landscape' };
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);

    layout.paletteMeasurement = {
      width: 768,
      height: PALETTE_BAR_RESERVE,
      orientation: 'portrait',
    };
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('gains headroom when buttons are switched off', () => {
    layout.viewportWidth = 600;
    layout.viewportHeight = 375;
    setScreenshot(false);
    setUndoButton(false);
    // n=4: (600 − 156 − 64 − 100) / 4 = 70px per button → 129%.
    expect(maxActionButtonScale()).toBe(129);
  });

  it('budgets for the free AI button without a credential', () => {
    layout.viewportWidth = 680;
    layout.viewportHeight = 360;
    // n=6: (680 − 156 − 64 − 124) / 6 = 56px per button → 103%.
    expect(maxActionButtonScale()).toBe(103);
  });

  it('subtracts safe-area insets from the budget', () => {
    layout.viewportWidth = 667;
    layout.viewportHeight = 375;
    Object.assign(layout.safeArea, { left: 30, right: 30 });
    // 60px of insets off the 323px budget: 263 / 6 = 43.83px → 81%.
    expect(maxActionButtonScale()).toBe(81);
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
    layout.viewportWidth = 1376;
    layout.viewportHeight = 1032;
    expect(actionButtonBase('landscape')).toBe(ACTION_BUTTON_BASE_PX.largeTablet.landscape);

    layout.viewportWidth = 1032;
    layout.viewportHeight = 1376;
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

// The hydrated render cap (a CSS length) and the slider ceiling (a number) are
// one formula, so evaluating the string with both safe-area insets at zero — as
// the fixtures' layout state has them — and --action-btn-scale at 1 has to land
// on exactly the budget availablePerButton reports.
const CSS_TOKEN_PATTERN = /min|calc|[-+*/(),]|\d+(?:\.\d+)?/g;

function tokenizeCssLength(expr: string, viewportWidth: number, basePx: number): string[] {
  const resolved = expr
    .replace(/var\(--safe-area-\w+\)/g, '0px')
    .replace('var(--action-btn-scale, 1)', '1')
    .replace(`var(${ACTION_BUTTON_BASE_PROPERTY})`, `${basePx}px`)
    .replace('100vw', `${viewportWidth}px`)
    .replace(/px\b/g, '');
  return resolved.match(CSS_TOKEN_PATTERN) ?? [];
}

// Recursive descent over the CSS subset buttonSizeCssExpr emits: min(), calc(),
// px lengths, and the four arithmetic operators.
function evaluateCssLength(expr: string, viewportWidth: number, basePx: number): number {
  const tokens = tokenizeCssLength(expr, viewportWidth, basePx);
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

const BUTTON_SIZE_FIXTURES = [
  {
    name: 'roomy landscape tablet',
    orientation: 'landscape',
    viewportWidth: 1280,
    viewportHeight: 800,
    paletteWidth: 156,
    paletteHeight: 800,
    buttonCount: 5,
    budgetWins: false,
  },
  {
    name: 'narrow landscape phone with every button',
    orientation: 'landscape',
    viewportWidth: 568,
    viewportHeight: 320,
    paletteWidth: 156,
    paletteHeight: 320,
    buttonCount: 6,
    budgetWins: true,
  },
  {
    name: 'single-column landscape palette',
    orientation: 'landscape',
    viewportWidth: 1024,
    viewportHeight: 768,
    paletteWidth: 84,
    paletteHeight: 768,
    buttonCount: 3,
    budgetWins: false,
  },
  {
    name: 'tall portrait phone',
    orientation: 'portrait',
    viewportWidth: 390,
    viewportHeight: 844,
    paletteWidth: 390,
    paletteHeight: 76,
    buttonCount: 5,
    budgetWins: false,
  },
  {
    name: 'short portrait phone with a deep palette',
    orientation: 'portrait',
    viewportWidth: 360,
    viewportHeight: 440,
    paletteWidth: 360,
    paletteHeight: 92,
    buttonCount: 6,
    budgetWins: true,
  },
] as const;

describe('buttonSizeCssExpr', () => {
  it.each(BUTTON_SIZE_FIXTURES)(
    'resolves to the same cap as the slider ceiling budget on a $name',
    (fixture) => {
      layout.orientation = fixture.orientation;
      layout.viewportWidth = fixture.viewportWidth;
      layout.viewportHeight = fixture.viewportHeight;
      layout.paletteMeasurement = {
        width: fixture.paletteWidth,
        height: fixture.paletteHeight,
        orientation: fixture.orientation,
      };

      const { buttonCount } = fixture;
      const inputs =
        fixture.orientation === 'portrait'
          ? {
              orientation: fixture.orientation,
              buttonCount,
              paletteHeight: resolvedPortraitPaletteHeight(),
              viewportHeight: layout.viewportHeight,
            }
          : {
              orientation: fixture.orientation,
              buttonCount,
              paletteWidth: resolvedLandscapePaletteWidth(),
            };
      const base = actionButtonBase(fixture.orientation);
      const available = availablePerButton(buttonCount);

      expect(available < base).toBe(fixture.budgetWins);
      expect(evaluateCssLength(buttonSizeCssExpr(inputs), layout.viewportWidth, base)).toBeCloseTo(
        Math.min(base, available)
      );
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
    setAdvancedControls(false);
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

  it('hides the whole panel when no action is visible', () => {
    freeGenerations.available = false;
    setCrayon(false);
    setMagicBrush(false);
    setEraser(false);
    setStrokeWidthControl(false);
    setColoringBook(false);
    setScreenshot(false);
    setUndoButton(false);
    const el = document.createElement('div');
    publishActionPanelState(el, false, 1);
    expect(el.hasAttribute(NO_ACTIONS_ATTRIBUTE)).toBe(true);
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
