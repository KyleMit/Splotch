import {
  BARE_RAIL_WIDTH_PX,
  BARE_RAIL_HEIGHT_PX,
  BARE_MENU_GAP_PX,
  VERTICAL_MENU_MAX_WIDTH_PX,
} from './bareToolbar';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import actionsPanelSource from './components/ActionsPanel.svelte?raw';
import colorPaletteSource from './components/ColorPalette.svelte?raw';
import { PALETTE_LANDSCAPE_WIDTH_PX } from './design/trimGeometry';
import {
  ACTION_BUTTON_BASE_PROPERTY,
  ACTION_BUTTON_BASE_PX,
  ACTION_BUTTON_COUNT_PROPERTY,
  ACTION_BUTTON_GAP,
  DRAWER_TOGGLE_SIZE,
  PHONE_TOOLBAR_GAP_PX,
  ACTION_BUTTON_SIZE_CLASS_MEDIA_QUERIES,
  ACTION_PANEL_LIVE_ATTRIBUTE,
  FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT,
  FLYOUT_OPTION_MIN_BASE_PX,
  LANDSCAPE_FIXED_RESERVE,
  PANEL_FIXED_CHROME,
  PANEL_INSET,
  PALETTE_BAR_RESERVE,
  PALETTE_CLEARANCE,
  PORTRAIT_FIXED_RESERVE,
  SETTINGS_BUTTON_RESERVE,
} from './actionButtonLayout';

const appCssSource = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');
const appHtmlSource = readFileSync(resolve(process.cwd(), 'src/app.html'), 'utf8');

// The declarations of one top-level rule. A `toContain` over the whole
// stylesheet answers "somewhere", which is not the question when the point is
// that a particular control is sized a particular way — a hardcoded size in the
// rule under test passes it as long as the expected expression survives
// anywhere else in the file. Top-level rules are the ones starting in column 0
// and closing on one, so a nested `@media` copy of the same selector can't be
// mistaken for the base rule.
function cssRuleBody(selector: string): string {
  const opening = `\n${selector} {`;
  const start = appCssSource.indexOf(opening);
  expect(start, `app.css has no top-level \`${selector}\` rule`).toBeGreaterThan(-1);
  const bodyStart = start + opening.length;
  return appCssSource.slice(bodyStart, appCssSource.indexOf('\n}', bodyStart));
}

// The CSS `--action-btn-size` formula in app.css owns the action-button size
// at first paint (before any TS loads — ADR-0040) and after hydration alike,
// so it bakes the sizing constants as literals rather than reading them. That
// is the one copy of the button-size formula that can't share the TS
// constants directly. This guard re-derives the expected literals from the
// constants and asserts the two `min(...)` formula blocks (landscape and
// portrait) still match, so a change to a constant can't silently leave the
// CSS stale (issue #518); actionButtonLayout.test.ts evaluates the same
// formulas against the slider ceiling.
const sizeFormulas = [...appCssSource.matchAll(/--action-btn-size:\s*min\(([\s\S]*?)\);/g)].map(
  (m) => m[1]
);

const scaledBase = `var(${ACTION_BUTTON_BASE_PROPERTY}) * var(--action-btn-scale, 1)`;

// Every size-class step app.css declares: the `@media` prelude that gates it —
// absent for the unqualified default — against its landscape/portrait pair.
const declaredBaseSteps = [
  ...appCssSource.matchAll(
    /(?:@media ([^{]+?)\s*\{\s*)?:root \{\s*--action-btn-base-landscape: (\d+)px;\s*--action-btn-base-portrait: (\d+)px;/g
  ),
].map(([, query, landscape, portrait]) => ({
  query,
  landscape: Number(landscape),
  portrait: Number(portrait),
}));

describe('action-button CSS fallback mirrors the layout constants', () => {
  it('keeps Bare masks aligned with the shared control and menu spacing', () => {
    expect(appCssSource).toContain(`--corner-button-size: ${DRAWER_TOGGLE_SIZE}px`);
    expect(appCssSource).toContain(
      `--landscape-pitch: calc(var(--action-btn-size) + ${PHONE_TOOLBAR_GAP_PX}px)`
    );
    expect(appCssSource).toContain(
      `html[data-toolbar='bare'] .actions-panel .flyout-menu {\n  padding: 0;\n  gap: ${BARE_MENU_GAP_PX}px;`
    );
    expect(appCssSource).toContain(
      `@media (orientation: portrait) and (max-width: ${VERTICAL_MENU_MAX_WIDTH_PX}px)`
    );
  });
  it('declares one size-class step per entry in ACTION_BUTTON_BASE_PX', () => {
    expect(declaredBaseSteps).toEqual([
      { query: undefined, ...ACTION_BUTTON_BASE_PX.tablet },
      { query: ACTION_BUTTON_SIZE_CLASS_MEDIA_QUERIES.phone, ...ACTION_BUTTON_BASE_PX.phone },
      {
        query: ACTION_BUTTON_SIZE_CLASS_MEDIA_QUERIES.largeTablet,
        ...ACTION_BUTTON_BASE_PX.largeTablet,
      },
    ]);
  });

  it('resolves the shared base to the orientation the panel is laid out for', () => {
    expect(appCssSource).toContain(
      `${ACTION_BUTTON_BASE_PROPERTY}: var(--action-btn-base-landscape)`
    );
    expect(appCssSource).toMatch(
      new RegExp(
        `@media \\(orientation: portrait\\) \\{\\s*:root \\{\\s*${ACTION_BUTTON_BASE_PROPERTY}: var\\(--action-btn-base-portrait\\)`
      )
    );
  });

  it('switches bootstrap selectors to the shared live-state marker', () => {
    expect(actionsPanelSource).toContain(ACTION_PANEL_LIVE_ATTRIBUTE);
  });

  it('has exactly two size formulas (landscape + portrait)', () => {
    expect(sizeFormulas).toHaveLength(2);
  });

  it('sizes the action button from the formula alone', () => {
    const button = cssRuleBody('.actions-panel .action-button');
    expect(button).toContain('width: var(--action-btn-size);');
    expect(button).toContain('height: var(--action-btn-size);');
    expect(appCssSource).not.toContain('--action-btn-fallback');
  });

  it('panel inset literals match PANEL_INSET', () => {
    expect(actionsPanelSource).toContain(
      `bottom: calc(${PANEL_INSET}px + var(--safe-area-bottom))`
    );
    expect(actionsPanelSource).toContain(`left: calc(${PANEL_INSET}px + var(--safe-area-left))`);
    expect(actionsPanelSource).toContain(
      `left: calc(var(--palette-landscape-width) + ${PANEL_INSET}px + var(--safe-area-left))`
    );
  });

  it('shares the responsive landscape palette width before hydration', () => {
    const widths = [...appCssSource.matchAll(/--palette-landscape-width:\s*(\d+)px/g)].map(
      (match) => Number(match[1])
    );
    expect(widths).toEqual([PALETTE_LANDSCAPE_WIDTH_PX, 0, 0]);
    expect(BARE_RAIL_WIDTH_PX).toBe(PALETTE_LANDSCAPE_WIDTH_PX);
    expect(BARE_RAIL_HEIGHT_PX).toBe(PALETTE_BAR_RESERVE);
    expect(colorPaletteSource).toContain('width: var(--palette-landscape-width)');
  });

  // The portrait counterpart, published for chrome that must start below the
  // bar rather than beside it — the AI Waiting Polaroid's top inset. CSS cannot
  // import the constant, so the two are held together here.
  it('shares the portrait palette-bar height, which the bar draws itself at', () => {
    expect(appCssSource).toMatch(
      new RegExp(`--palette-portrait-height:\\s*${PALETTE_BAR_RESERVE}px`)
    );
    expect(colorPaletteSource).toContain('height: var(--palette-portrait-height)');
  });

  it('landscape formula matches the constants', () => {
    const [landscape] = sizeFormulas;
    expect(landscape).toContain(scaledBase);
    // 100vw minus the palette, fixed chrome, and the gap total around however
    // many buttons the panel lays out.
    expect(landscape).toContain(
      `100vw - var(--palette-landscape-width) - ${LANDSCAPE_FIXED_RESERVE}px - var(--action-btn-gap-total)`
    );
    expect(landscape).toMatch(new RegExp(`/\\s*var\\(${ACTION_BUTTON_COUNT_PROPERTY}\\)(?:\\s|$)`));
    expect(cssRuleBody('.actions-panel')).toContain(
      `--action-btn-gap-total: calc((var(${ACTION_BUTTON_COUNT_PROPERTY}) - 1) * ${ACTION_BUTTON_GAP}px)`
    );
    expect(LANDSCAPE_FIXED_RESERVE).toBe(SETTINGS_BUTTON_RESERVE + PANEL_FIXED_CHROME);
  });

  // The count the formula divides by: five in the stylesheet for the
  // prerendered row, re-seeded on <html> by app.html when persisted settings
  // hide controls, published on the panel once hydrated.
  it('seeds the first-paint button count where app.html and the panel can override it', () => {
    expect(appCssSource).toMatch(
      new RegExp(
        `${ACTION_BUTTON_COUNT_PROPERTY}:\\s*${FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT}\\b`
      )
    );
    expect(appHtmlSource).toMatch(
      new RegExp(`if \\(actionButtonCount !== ${FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT}\\b`)
    );
    expect(appHtmlSource).toContain(`setProperty('${ACTION_BUTTON_COUNT_PROPERTY}'`);
    expect(appHtmlSource).not.toContain('first-paint-gap-total');
  });

  it('hydrated drawer gap matches ACTION_BUTTON_GAP', () => {
    expect(actionsPanelSource).toMatch(new RegExp(`gap: ${ACTION_BUTTON_GAP}px;`));
  });

  it('portrait formula matches the constants', () => {
    const portrait = sizeFormulas[1];
    expect(portrait).toContain(scaledBase);
    // The visible viewport minus the palette bar, its clearance, the panel's
    // fixed chrome and the gap total.
    expect(portrait).toContain(
      `100dvh - var(--palette-portrait-height) - ${PORTRAIT_FIXED_RESERVE}px - var(--action-btn-gap-total)`
    );
    expect(portrait).toMatch(new RegExp(`/\\s*var\\(${ACTION_BUTTON_COUNT_PROPERTY}\\)(?:\\s|$)`));
    expect(PORTRAIT_FIXED_RESERVE).toBe(PALETTE_CLEARANCE + PANEL_FIXED_CHROME);
  });

  it('pads the action button by a share of its own size-class step', () => {
    expect(cssRuleBody('.actions-panel .action-button')).toContain(
      `padding: calc(var(${ACTION_BUTTON_BASE_PROPERTY}) / 6 * var(--action-btn-scale, 1))`
    );
  });

  it('floors a flyout option at FLYOUT_OPTION_MIN_BASE_PX and squares it above', () => {
    const flyoutOption = cssRuleBody('.flyout-option');
    const optionBase = '--flyout-option-base';
    expect(flyoutOption).toContain(
      `${optionBase}: max(var(${ACTION_BUTTON_BASE_PROPERTY}), ${FLYOUT_OPTION_MIN_BASE_PX}px)`
    );
    for (const axis of ['width', 'height']) {
      expect(flyoutOption).toContain(
        `${axis}: calc(var(${optionBase}) * var(--action-btn-scale, 1))`
      );
    }
  });
});
