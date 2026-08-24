import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import actionsPanelSource from './components/ActionsPanel.svelte?raw';
import colorPaletteSource from './components/ColorPalette.svelte?raw';
import {
  landscapeSingleColumnMediaQuery,
  PALETTE_LANDSCAPE_WIDTHS_PX,
} from './design/trimGeometry';
import {
  ACTION_BUTTON_BASE_PROPERTY,
  ACTION_BUTTON_BASE_PX,
  ACTION_BUTTON_GAP,
  ACTION_BUTTON_SIZE_CLASS_MEDIA_QUERIES,
  ACTION_PANEL_LIVE_ATTRIBUTE,
  FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT,
  FIRST_PAINT_ACTION_BUTTON_GAP_TOTAL_DEFAULT,
  FLYOUT_OPTION_MIN_BASE_PX,
  LANDSCAPE_FIXED_RESERVE,
  MAX_ACTION_BUTTON_COUNT,
  PANEL_FIXED_CHROME,
  PANEL_INSET,
  PALETTE_BAR_RESERVE,
  PALETTE_CLEARANCE,
  SETTINGS_BUTTON_RESERVE,
  WORST_CASE_CHROME,
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

// The CSS `--action-btn-fallback` in app.css owns the action-button
// size at first paint (before any TS loads — ADR-0040), so it bakes the sizing
// constants as literals rather than reading them. That is the one copy of the
// button-size formula that can't share the TS constants directly. This guard
// re-derives the expected literals from the constants and asserts the two
// `min(...)` fallback blocks still match, so a change to a constant can't
// silently leave the CSS stale (issue #518).
const fallbackBlocks = [
  ...appCssSource.matchAll(/--action-btn-fallback:\s*min\(([\s\S]*?)\);/g),
].map((m) => m[1]);

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

  it('has exactly two fallback blocks (landscape + portrait)', () => {
    expect(fallbackBlocks).toHaveLength(2);
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
    expect(widths).toEqual([
      PALETTE_LANDSCAPE_WIDTHS_PX.twoColumns,
      PALETTE_LANDSCAPE_WIDTHS_PX.singleColumn,
    ]);
    expect(appCssSource).toContain(landscapeSingleColumnMediaQuery());
    expect(colorPaletteSource).toContain('width: var(--palette-landscape-width)');
  });

  // The portrait counterpart, published for chrome that must start below the
  // bar rather than beside it — the AI Waiting Polaroid's top inset. CSS cannot
  // import the constant, so the two are held together here.
  it('shares the portrait palette-bar height before hydration', () => {
    expect(appCssSource).toMatch(
      new RegExp(`--palette-portrait-height:\\s*${PALETTE_BAR_RESERVE}px`)
    );
  });

  it('landscape fallback matches the constants', () => {
    const [landscape] = fallbackBlocks;
    expect(landscape).toContain(scaledBase);
    // 100vw minus the palette, fixed chrome, and the dynamic gap total around
    // the 1–5 buttons that persisted settings leave visible before hydration.
    expect(landscape).toContain(
      `100vw - var(--palette-landscape-width) - ${LANDSCAPE_FIXED_RESERVE}px`
    );
    expect(landscape).toContain('var(--action-btn-first-paint-gap-total)');
    expect(landscape).toMatch(/\/\s*var\(--action-btn-first-paint-count\)(?:\s|$)/);
    expect(appCssSource).toMatch(
      new RegExp(`--action-btn-first-paint-count:\\s*${FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT}\\b`)
    );
    expect(appCssSource).toContain(
      `--action-btn-first-paint-gap-total: ${FIRST_PAINT_ACTION_BUTTON_GAP_TOTAL_DEFAULT}px`
    );
    expect(appHtmlSource).toMatch(
      new RegExp(`if \\(actionButtonCount !== ${FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT}\\b`)
    );
    expect(appHtmlSource).toContain(`${ACTION_BUTTON_GAP} * (actionButtonCount - 1) + 'px'`);
    expect(LANDSCAPE_FIXED_RESERVE).toBe(SETTINGS_BUTTON_RESERVE + PANEL_FIXED_CHROME);
  });

  it('hydrated drawer gap matches ACTION_BUTTON_GAP', () => {
    expect(actionsPanelSource).toMatch(new RegExp(`gap: ${ACTION_BUTTON_GAP}px;`));
  });

  it('portrait fallback matches the constants', () => {
    const portrait = fallbackBlocks[1];
    expect(portrait).toContain(scaledBase);
    // 100vh minus palette clearance + worst-case chrome + the palette bar.
    expect(portrait).toContain(
      `100vh - ${PALETTE_CLEARANCE + WORST_CASE_CHROME + PALETTE_BAR_RESERVE}px`
    );
    expect(portrait).toMatch(new RegExp(`/\\s*${MAX_ACTION_BUTTON_COUNT}\\b`));
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
