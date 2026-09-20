import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toolbarGlassPanes } from './glassPanes';
import { PALETTE_BAR_RESERVE, renderedActionButtonSize } from './actionButtonLayout';
import { PALETTE_LANDSCAPE_WIDTH_PX } from './design/trimGeometry';
import { settingsState } from './state/settings.svelte';

const layout = vi.hoisted(() => ({
  viewportWidth: 1180,
  viewportHeight: 820,
  orientation: 'landscape' as 'landscape' | 'portrait',
  phoneLandscape: false,
  safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
}));
vi.mock('./state/layout.svelte', () => ({ layoutState: layout }));

beforeEach(() => {
  Object.assign(layout, {
    viewportWidth: 1180,
    viewportHeight: 820,
    orientation: 'landscape',
    phoneLandscape: false,
    safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  settingsState.setToolbarStyle('bare');
  settingsState.setActionButtonScale(100);
  settingsState.setToolDrawerEnabled(true);
  settingsState.setCrayon(true);
  settingsState.setMagicBrush(true);
  settingsState.setEraser(true);
  settingsState.setStrokeWidthControl(true);
  settingsState.setColoringBook(true);
  settingsState.setScreenshot(true);
  settingsState.setUndoButton(true);
  settingsState.setAiImage(false);
});

describe('toolbar glass geometry', () => {
  it('defers panes until the viewport exists', () => {
    layout.viewportWidth = 0;
    expect(toolbarGlassPanes(null, false)).toEqual([]);
  });
  it('clips the landscape pane exactly against the rail', () => {
    expect(toolbarGlassPanes(null, true)[0].x).toBe(PALETTE_LANDSCAPE_WIDTH_PX);
  });
  it('shrinks the landscape strip with the drawer', () => {
    expect(toolbarGlassPanes(null, false)[0].width).toBeLessThan(
      toolbarGlassPanes(null, true)[0].width
    );
  });
  it.each(['brush', 'stroke'] as const)('unites the %s menu with the strip in one mask', (menu) => {
    const closed = toolbarGlassPanes(null, true);
    const open = toolbarGlassPanes(menu, true);
    expect(open).toHaveLength(closed.length);
    expect(open[0].y).toBeLessThan(closed[0].y);
    expect(decodeURIComponent(open[0].mask).match(/<rect /g)).toHaveLength(2);
  });
  it('follows safe-area insets at the rail boundary', () => {
    layout.safeArea.left = 30;
    expect(toolbarGlassPanes(null, true)[0].x).toBe(30 + PALETTE_LANDSCAPE_WIDTH_PX);
  });
  it('keeps only corner glass when every action is disabled', () => {
    settingsState.setToolDrawerEnabled(false);
    settingsState.setColoringBook(false);
    settingsState.setScreenshot(false);
    expect(toolbarGlassPanes(null, true)).toHaveLength(1);
    expect(toolbarGlassPanes(null, true)[0].x).toBeGreaterThan(layout.viewportWidth / 2);
  });
  it.each([390, 820])('fits the portrait menu at width %s', (width) => {
    Object.assign(layout, { viewportWidth: width, viewportHeight: 1180, orientation: 'portrait' });
    const pane = toolbarGlassPanes('stroke', true)[0];
    expect(pane.y).toBeGreaterThanOrEqual(PALETTE_BAR_RESERVE);
    expect(pane.x + pane.width).toBeLessThanOrEqual(width);
  });
  it.each([false, true])('unites the compact color menu with the drawer open=%s', (expanded) => {
    Object.assign(layout, { viewportWidth: 844, viewportHeight: 390, phoneLandscape: true });
    const panes = toolbarGlassPanes('color', expanded);
    expect(panes).toHaveLength(1);
    expect(panes[0].x).toBe(0);
    expect(panes[0].width).toBe(844);
  });
  it('uses the phone button scale and viewport cap', () => {
    Object.assign(layout, { viewportWidth: 844, viewportHeight: 390, phoneLandscape: true });
    settingsState.setActionButtonScale(70);
    expect(renderedActionButtonSize()).toBeCloseTo(33.6);
    settingsState.setActionButtonScale(130);
    expect(renderedActionButtonSize()).toBeCloseTo(62.4);
  });
});
