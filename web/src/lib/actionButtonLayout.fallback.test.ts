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
  ACTION_PANEL_LIVE_ATTRIBUTE,
  MAX_ACTION_BUTTON_COUNT,
  PANEL_INSET,
  PALETTE_BAR_RESERVE,
  PALETTE_CLEARANCE,
  PRERENDERED_ACTION_BUTTON_CHROME,
  PRERENDERED_ACTION_BUTTON_COUNT,
  SETTINGS_BUTTON_RESERVE,
  WORST_CASE_CHROME,
} from './actionButtonLayout';

const appCssSource = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

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
    // 100vw minus the palette, right-edge Settings Button, and the chrome around
    // the five buttons that can exist in the prerendered DOM.
    expect(landscape).toContain(
      `100vw - var(--palette-landscape-width) - ${SETTINGS_BUTTON_RESERVE + PRERENDERED_ACTION_BUTTON_CHROME}px`
    );
    expect(landscape).toMatch(new RegExp(`/\\s*${PRERENDERED_ACTION_BUTTON_COUNT}`));
  });

  it('portrait fallback matches the constants', () => {
    const portrait = fallbackBlocks[1];
    expect(portrait).toContain(`${ACTION_BUTTON_BASE_PORTRAIT}px * var(--action-btn-scale, 1)`);
    // 100vh minus palette clearance + worst-case chrome + the palette bar.
    expect(portrait).toContain(
      `100vh - ${PALETTE_CLEARANCE + WORST_CASE_CHROME + PALETTE_BAR_RESERVE}px`
    );
    expect(portrait).toMatch(new RegExp(`/\\s*${MAX_ACTION_BUTTON_COUNT}`));
  });
});
