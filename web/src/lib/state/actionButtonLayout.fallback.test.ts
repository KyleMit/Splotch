import { describe, expect, it } from 'vitest';
import actionsPanelSource from '../components/ActionsPanel.svelte?raw';
import {
  ACTION_BUTTON_BASE_LANDSCAPE,
  ACTION_BUTTON_BASE_PORTRAIT,
  MAX_ACTION_BUTTON_COUNT,
  PALETTE_BAR_RESERVE,
  PALETTE_CLEARANCE,
  PARENT_BUTTON_RESERVE,
  WORST_CASE_CHROME,
} from './actionButtonLayout.svelte';

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
  it('has exactly two fallback blocks (landscape + portrait)', () => {
    expect(fallbackBlocks).toHaveLength(2);
  });

  it('landscape fallback matches the constants', () => {
    const [landscape] = fallbackBlocks;
    expect(landscape).toContain(`${ACTION_BUTTON_BASE_LANDSCAPE}px * var(--action-btn-scale, 1)`);
    // 100vw minus the right-edge Parent Help Button reserve + worst-case chrome.
    expect(landscape).toContain(`100vw - ${PARENT_BUTTON_RESERVE + WORST_CASE_CHROME}px`);
    expect(landscape).toContain(`/ ${MAX_ACTION_BUTTON_COUNT}`);
  });

  it('portrait fallback matches the constants', () => {
    const portrait = fallbackBlocks[1];
    expect(portrait).toContain(`${ACTION_BUTTON_BASE_PORTRAIT}px * var(--action-btn-scale, 1)`);
    // 100vh minus palette clearance + worst-case chrome + the palette bar.
    expect(portrait).toContain(
      `100vh - ${PALETTE_CLEARANCE + WORST_CASE_CHROME + PALETTE_BAR_RESERVE}px`
    );
    expect(portrait).toContain(`/ ${MAX_ACTION_BUTTON_COUNT}`);
  });
});
