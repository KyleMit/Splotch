import { describe, it, expect, beforeEach } from 'vitest';
import {
  settings,
  setSound,
  setSoundVolume,
  setEraser,
  setDrawerOpen,
  setAiAccessToken,
  reloadSettings,
} from './settings.svelte';

const SOUND_KEY = 'splotch-sound-enabled';
const SOUND_VOLUME_KEY = 'splotch-sound-volume';
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

describe('setSoundVolume', () => {
  it('updates the live store and persists the volume percentage', () => {
    setSoundVolume(75);
    expect(settings.soundVolume).toBe(75);
    expect(localStorage.getItem(SOUND_VOLUME_KEY)).toBe('75');
  });

  it('clamps stored volume between 0 and 100', () => {
    setSoundVolume(125);
    expect(settings.soundVolume).toBe(100);
    expect(localStorage.getItem(SOUND_VOLUME_KEY)).toBe('100');

    setSoundVolume(-10);
    expect(settings.soundVolume).toBe(0);
    expect(localStorage.getItem(SOUND_VOLUME_KEY)).toBe('0');
  });

  it('falls back to normal volume for invalid values', () => {
    setSoundVolume(NaN);
    expect(settings.soundVolume).toBe(50);
    expect(localStorage.getItem(SOUND_VOLUME_KEY)).toBe('50');
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
    localStorage.setItem(SOUND_VOLUME_KEY, '35');
    localStorage.setItem(DRAWER_OPEN_KEY, 'true');
    localStorage.setItem(AI_ACCESS_TOKEN_KEY, 'recovered-token');

    reloadSettings();

    expect(settings.soundEnabled).toBe(false);
    expect(settings.soundVolume).toBe(35);
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
