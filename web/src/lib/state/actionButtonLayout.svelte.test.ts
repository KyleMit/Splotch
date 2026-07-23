import { describe, it, expect, beforeEach } from 'vitest';
import { layout } from './layout.svelte';
import { network } from './network.svelte';
import {
  setAdvancedControls,
  setAiAccessToken,
  setAiImage,
  setColoringBook,
  setEraser,
  setScreenshot,
  setStrokeWidthControl,
  setUndoButton,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
} from './settings.svelte';
import { selectBrush } from './tool.svelte';
import {
  visibleActionButtonCount,
  maxActionButtonScale,
  publishActionPanelState,
} from './actionButtonLayout.svelte';

function resetState() {
  setAdvancedControls(true);
  setStrokeWidthControl(true);
  setEraser(true);
  setColoringBook(true);
  setScreenshot(true);
  setUndoButton(true);
  setAiImage(true);
  setAiAccessToken('');
  network.online = true;

  layout.orientation = 'landscape';
  layout.viewportWidth = 1280;
  layout.viewportHeight = 800;
  layout.paletteWidth = 156;
  layout.paletteHeight = 76;
  Object.assign(layout.safeArea, { top: 0, right: 0, bottom: 0, left: 0 });
}

beforeEach(resetState);

describe('visibleActionButtonCount', () => {
  it('counts the five always-available buttons by default (no AI token)', () => {
    expect(visibleActionButtonCount()).toBe(5);
  });

  it('adds the AI button only when token + toggle + connectivity all hold', () => {
    setAiAccessToken('tok');
    expect(visibleActionButtonCount()).toBe(6);

    network.online = false;
    expect(visibleActionButtonCount()).toBe(5);

    network.online = true;
    setAiImage(false);
    expect(visibleActionButtonCount()).toBe(5);
  });

  it('drops buttons the parent switched off', () => {
    setStrokeWidthControl(false);
    setUndoButton(false);
    expect(visibleActionButtonCount()).toBe(3);
  });

  it('the eraser toggle hides a Brush Menu entry, not a button', () => {
    setEraser(false);
    expect(visibleActionButtonCount()).toBe(5);
  });
});

// Landscape budget: viewportWidth − paletteWidth − 64 (Parent Help Button
// reserve) − side insets − (8 inset + 8 margin + 48 toggle + gaps). Portrait
// swaps in viewportHeight − paletteHeight − 8 clearance − vertical insets.
describe('maxActionButtonScale', () => {
  it('returns the static max when the screen has room to spare', () => {
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('caps below 100% on a small landscape phone', () => {
    layout.viewportWidth = 600;
    layout.viewportHeight = 375;
    // (600 − 156 − 64 − 112) / 5 = 53.6px per button → 89% of the 60px base.
    expect(maxActionButtonScale()).toBe(89);
  });

  it('never drops below the slider minimum', () => {
    layout.viewportWidth = 520;
    layout.viewportHeight = 320;
    // 37.6px per button would be 62% — clamped to the static minimum.
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MIN);
  });

  it('uses the vertical budget and 55px base in portrait', () => {
    layout.orientation = 'portrait';
    layout.viewportWidth = 360;
    layout.viewportHeight = 440;
    // (440 − 76 − 8 − 112) / 5 = 48.8px per button → 88% of the 55px base.
    expect(maxActionButtonScale()).toBe(88);
  });

  it('portrait tall screens clear the static max', () => {
    layout.orientation = 'portrait';
    layout.viewportWidth = 360;
    layout.viewportHeight = 740;
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('gains headroom when buttons are switched off', () => {
    layout.viewportWidth = 600;
    layout.viewportHeight = 375;
    setScreenshot(false);
    setUndoButton(false);
    // n=3: (600 − 156 − 64 − 88) / 3 = 97.33px per button → over the max.
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('loses headroom when the AI button joins the row', () => {
    layout.viewportWidth = 680;
    layout.viewportHeight = 360;
    setAiAccessToken('tok');
    // n=6: (680 − 156 − 64 − 124) / 6 = 56px per button → 93%.
    expect(maxActionButtonScale()).toBe(93);
  });

  it('subtracts safe-area insets from the budget', () => {
    layout.viewportWidth = 667;
    layout.viewportHeight = 375;
    Object.assign(layout.safeArea, { left: 30, right: 30 });
    // 60px of insets off the 335px budget: 275 / 5 = 55px → 91%.
    expect(maxActionButtonScale()).toBe(91);
  });
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
    expect(el.hasAttribute('data-drawer-open')).toBe(false);
    for (const attr of [
      'data-off-adv',
      'data-off-stroke',
      'data-off-eraser',
      'data-off-coloring',
      'data-off-screenshot',
      'data-off-undo',
    ]) {
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

  it('stamps every data-off-<control> when all six controls are switched off', () => {
    setAdvancedControls(false);
    setStrokeWidthControl(false);
    setEraser(false);
    setColoringBook(false);
    setScreenshot(false);
    setUndoButton(false);
    const el = document.createElement('div');
    publishActionPanelState(el, false, 1);
    for (const attr of [
      'data-off-adv',
      'data-off-stroke',
      'data-off-eraser',
      'data-off-coloring',
      'data-off-screenshot',
      'data-off-undo',
    ]) {
      expect(el.hasAttribute(attr)).toBe(true);
    }
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
