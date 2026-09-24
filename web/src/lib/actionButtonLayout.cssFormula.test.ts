import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PHONE_LANDSCAPE_QUERY } from './breakpoints';
import type { SafeAreaInsets } from './platform/safeArea';
import { layoutState } from './state/layout.svelte';
import { PALETTE_LANDSCAPE_WIDTH_PX } from './design/trimGeometry';
import {
  ACTION_BUTTON_BASE_PROPERTY,
  actionButtonBase,
  PALETTE_BAR_RESERVE,
  availablePerButton,
  ACTION_BUTTON_GAP,
  ACTION_BUTTON_COUNT_PROPERTY,
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
