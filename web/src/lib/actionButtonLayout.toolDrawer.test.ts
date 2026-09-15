import { beforeEach, describe, expect, it } from 'vitest';
import { networkState } from './state/network.svelte';
import { freeGenerationsState } from './state/freeGenerations.svelte';
import {
  settingsState,
  setAiImage,
  setColoringBook,
  setCrayon,
  setEraser,
  setMagicBrush,
  setScreenshot,
  setStrokeWidthControl,
  setToolDrawerEnabled,
  setUndoButton,
  TOOL_DRAWER_CONTROLS,
} from './state/settings.svelte';
import { selectBrush, toolState } from './state/tool.svelte';
import {
  CONTROL_OFF_ATTRIBUTES,
  NO_ACTIONS_ATTRIBUTE,
  visibleActionButtonCount,
  publishActionPanelState,
} from './actionButtonLayout';

// Every control on and the AI button reachable, so the six-button panel is the
// starting point each case subtracts from.
beforeEach(() => {
  setToolDrawerEnabled(true);
  setStrokeWidthControl(true);
  setCrayon(true);
  setMagicBrush(true);
  setEraser(true);
  setColoringBook(true);
  setScreenshot(true);
  setAiImage(true);
  settingsState.mirrorAiAccessToken('');
  settingsState.mirrorAiUserApiKey('');
  networkState.online = true;
  freeGenerationsState.available = true;
  selectBrush('pen');
});

function publishedPanel() {
  const el = document.createElement('div');
  publishActionPanelState(el, false, 1);
  return el;
}

describe('the Tool Drawer switch', () => {
  it('hides only the drawer-owned controls, leaving the camera, coloring books, and AI', () => {
    setToolDrawerEnabled(false);
    expect(visibleActionButtonCount()).toBe(3);

    const el = publishedPanel();
    for (const control of TOOL_DRAWER_CONTROLS) {
      expect(el.hasAttribute(CONTROL_OFF_ATTRIBUTES[control]), control).toBe(true);
    }
    expect(el.hasAttribute(CONTROL_OFF_ATTRIBUTES.coloringBookEnabled)).toBe(false);
    expect(el.hasAttribute(CONTROL_OFF_ATTRIBUTES.screenshotEnabled)).toBe(false);
    expect(el.hasAttribute(NO_ACTIONS_ATTRIBUTE)).toBe(false);
  });

  it('leaves the per-tool flags untouched, so switching it back on restores them', () => {
    setUndoButton(false);
    setToolDrawerEnabled(false);
    expect(settingsState.undoButtonEnabled).toBe(false);
    expect(settingsState.crayonEnabled).toBe(true);

    setToolDrawerEnabled(true);
    expect(visibleActionButtonCount()).toBe(5);
  });

  it('empties the panel only once the other sections have hidden their buttons too', () => {
    setToolDrawerEnabled(false);
    setColoringBook(false);
    setScreenshot(false);
    setAiImage(false);
    expect(visibleActionButtonCount()).toBe(0);
    expect(publishedPanel().hasAttribute(NO_ACTIONS_ATTRIBUTE)).toBe(true);
  });

  it('drops a held drawer brush back to ink, the way switching that brush off does', () => {
    selectBrush('eraser');
    setToolDrawerEnabled(false);
    expect(toolState.brush).toBe('pen');
  });
});
