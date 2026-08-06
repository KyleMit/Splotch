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
  ACTION_BUTTON_BASE_LANDSCAPE,
  ACTION_BUTTON_BASE_PORTRAIT,
  ACTION_BUTTON_GAP,
  ACTION_PANEL_LIVE_ATTRIBUTE,
  FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT,
  FIRST_PAINT_ACTION_BUTTON_GAP_TOTAL_DEFAULT,
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

// The CSS `--action-btn-fallback` in ActionsPanel.svelte owns the action-button
// size at first paint (before any TS loads — ADR-0040), so it bakes the sizing
// constants as literals rather than reading them. That is the one copy of the
// button-size formula that can't share the TS constants directly. This guard
// re-derives the expected literals from the constants and asserts the two
// `min(...)` fallback blocks still match, so a change to a constant can't
// silently leave the CSS stale (issue #518).
const fallbackBlocks = [
  ...actionsPanelSource.matchAll(/--action-btn-fallback:\s*min\(([\s\S]*?)\);/g),
].map((m) => m[1]);

describe('action-button CSS fallback mirrors the layout constants', () => {
  it('switches bootstrap selectors to the shared live-state marker', () => {
    expect(actionsPanelSource).toContain(ACTION_PANEL_LIVE_ATTRIBUTE);
  });

  it('has exactly two fallback blocks (landscape + portrait)', () => {
    expect(fallbackBlocks).toHaveLength(2);
  });

  it('panel inset literals match PANEL_INSET', () => {
    expect(actionsPanelSource).toContain(
      `bottom: calc(${PANEL_INSET}px + env(safe-area-inset-bottom))`
    );
    expect(actionsPanelSource).toContain(
      `left: calc(${PANEL_INSET}px + env(safe-area-inset-left))`
    );
    expect(actionsPanelSource).toContain(
      `left: calc(var(--palette-landscape-width) + ${PANEL_INSET}px + env(safe-area-inset-left))`
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

  it('landscape fallback matches the constants', () => {
    const [landscape] = fallbackBlocks;
    expect(landscape).toContain(`${ACTION_BUTTON_BASE_LANDSCAPE}px * var(--action-btn-scale, 1)`);
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
    expect(portrait).toContain(`${ACTION_BUTTON_BASE_PORTRAIT}px * var(--action-btn-scale, 1)`);
    // 100vh minus palette clearance + worst-case chrome + the palette bar.
    expect(portrait).toContain(
      `100vh - ${PALETTE_CLEARANCE + WORST_CASE_CHROME + PALETTE_BAR_RESERVE}px`
    );
    expect(portrait).toMatch(new RegExp(`/\\s*${MAX_ACTION_BUTTON_COUNT}\\b`));
  });

  it('flyout-option size matches the landscape constant', () => {
    const expected = `calc(${ACTION_BUTTON_BASE_LANDSCAPE}px * var(--action-btn-scale, 1))`;
    expect(appCssSource).toContain(`width: ${expected}`);
    expect(appCssSource).toContain(`height: ${expected}`);
  });
});
