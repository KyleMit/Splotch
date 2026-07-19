import { describe, it, expect, beforeEach } from 'vitest';
import { layout } from './layout.svelte';
import { network } from './network.svelte';
import {
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
import { visibleActionButtonCount, maxActionButtonScale } from './actionButtonLayout.svelte';

function resetState() {
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
  it('counts the seven always-available buttons by default (no AI token)', () => {
    expect(visibleActionButtonCount()).toBe(7);
  });

  it('adds the AI button only when token + toggle + connectivity all hold', () => {
    setAiAccessToken('tok');
    expect(visibleActionButtonCount()).toBe(8);

    network.online = false;
    expect(visibleActionButtonCount()).toBe(7);

    network.online = true;
    setAiImage(false);
    expect(visibleActionButtonCount()).toBe(7);
  });

  it('drops buttons the parent switched off', () => {
    setEraser(false);
    setUndoButton(false);
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
    layout.viewportWidth = 667;
    layout.viewportHeight = 375;
    // (667 − 156 − 64 − 136) / 7 = 44.43px per button → 74% of the 60px base.
    expect(maxActionButtonScale()).toBe(74);
  });

  it('never drops below the slider minimum', () => {
    layout.viewportWidth = 568;
    layout.viewportHeight = 320;
    // 37.3px per button would be 62% — clamped to the static minimum.
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MIN);
  });

  it('uses the vertical budget and 55px base in portrait', () => {
    layout.orientation = 'portrait';
    layout.viewportWidth = 360;
    layout.viewportHeight = 480;
    // (480 − 76 − 8 − 136) / 7 = 37.14px per button → 67%, clamped to 70%.
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MIN);
  });

  it('portrait tall screens clear the static max', () => {
    layout.orientation = 'portrait';
    layout.viewportWidth = 360;
    layout.viewportHeight = 740;
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MAX);
  });

  it('gains headroom when buttons are switched off', () => {
    layout.viewportWidth = 667;
    layout.viewportHeight = 375;
    setEraser(false);
    setUndoButton(false);
    // n=5: (667 − 156 − 64 − 112) / 5 = 67px per button → 111%.
    expect(maxActionButtonScale()).toBe(111);
  });

  it('loses headroom when the AI button joins the row', () => {
    layout.viewportWidth = 740;
    layout.viewportHeight = 360;
    setAiAccessToken('tok');
    // n=8: (740 − 156 − 64 − 148) / 8 = 46.5px per button → 77%.
    expect(maxActionButtonScale()).toBe(77);
  });

  it('subtracts safe-area insets from the budget', () => {
    layout.viewportWidth = 667;
    layout.viewportHeight = 375;
    Object.assign(layout.safeArea, { left: 30, right: 30 });
    // 60px of insets off the 311px budget: 251 / 7 = 35.86px → clamped to 70%.
    expect(maxActionButtonScale()).toBe(ACTION_BUTTON_SCALE_MIN);
  });
});
