import { describe, it, expect, beforeEach } from 'vitest';
import {
  settings,
  setSound,
  setEraser,
  setDrawerOpen,
  setAiAccessToken,
  reloadSettings
} from './settings.svelte';

const SOUND_KEY = 'splotch-sound-enabled';
const ERASER_KEY = 'splotch-eraser-enabled';
const DRAWER_OPEN_KEY = 'splotch-drawer-open';
const AI_ACCESS_TOKEN_KEY = 'splotch-ai-access-token';

beforeEach(() => {
  localStorage.clear();
});

describe('boolean setters', () => {
  it('updates the live store and persists to localStorage', () => {
    setSound(false);
    expect(settings.soundEnabled).toBe(false);
    expect(localStorage.getItem(SOUND_KEY)).toBe('false');

    setSound(true);
    expect(settings.soundEnabled).toBe(true);
    expect(localStorage.getItem(SOUND_KEY)).toBe('true');
  });

  it('each setter writes only its own key', () => {
    setEraser(false);
    expect(settings.eraserEnabled).toBe(false);
    expect(localStorage.getItem(ERASER_KEY)).toBe('false');
    expect(localStorage.getItem(SOUND_KEY)).toBeNull();
  });
});

describe('setAiAccessToken', () => {
  it('persists the token verbatim as a string', () => {
    setAiAccessToken('abc123');
    expect(settings.aiAccessToken).toBe('abc123');
    expect(localStorage.getItem(AI_ACCESS_TOKEN_KEY)).toBe('abc123');
  });
});

describe('reloadSettings', () => {
  it('re-reads every persisted setting into the live store (durable-recovery path)', () => {
    // Simulate values recovered into localStorage by the durable layer after a
    // WebView eviction, differing from the current in-memory state.
    setSound(true);
    setDrawerOpen(false);
    localStorage.setItem(SOUND_KEY, 'false');
    localStorage.setItem(DRAWER_OPEN_KEY, 'true');
    localStorage.setItem(AI_ACCESS_TOKEN_KEY, 'recovered-token');

    reloadSettings();

    expect(settings.soundEnabled).toBe(false);
    expect(settings.drawerOpen).toBe(true);
    expect(settings.aiAccessToken).toBe('recovered-token');
  });

  it('keeps the current value when a key is absent', () => {
    setEraser(false);
    localStorage.removeItem(ERASER_KEY);
    reloadSettings();
    expect(settings.eraserEnabled).toBe(false);
  });
});
