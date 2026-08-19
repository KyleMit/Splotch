import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../storage';

import {
  settings,
  setSound,
  setSoundVolume,
  setActionButtonScale,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
  ACTION_BUTTON_SCALE_DEFAULT,
  setCrayon,
  setMagicBrush,
  setEraser,
  setDrawerOpen,
  setTheme,
  reloadSettings,
  aiCredentialKind,
} from './settings.svelte';
import { selectBrush, toolState } from './tool.svelte';

beforeEach(() => {
  setCrayon(true);
  setMagicBrush(true);
  setEraser(true);
  selectBrush('pen');
  localStorage.clear();
});

describe('defaults', () => {
  it('keeps AI image creation off until a parent opts in', () => {
    expect(settings.aiImageEnabled).toBe(false);
  });
});

describe('boolean setters', () => {
  it('updates the live store and persists to localStorage', () => {
    setSound(false);
    expect(settings.soundEnabled).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBe('false');

    setSound(true);
    expect(settings.soundEnabled).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBe('true');
  });

  it('each setter writes only its own key', () => {
    setEraser(false);
    expect(settings.eraserEnabled).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.eraserEnabled)).toBe('false');
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBeNull();
  });

  it.each([
    ['crayon', setCrayon, STORAGE_KEYS.crayonEnabled],
    ['magic', setMagicBrush, STORAGE_KEYS.magicBrushEnabled],
    ['eraser', setEraser, STORAGE_KEYS.eraserEnabled],
  ] as const)('persists the %s availability setting', (_brush, setter, key) => {
    setter(false);
    expect(localStorage.getItem(key)).toBe('false');
  });

  it.each([
    ['crayon', setCrayon],
    ['magic', setMagicBrush],
    ['eraser', setEraser],
  ] as const)('returns an active %s brush to Pen when disabled', (brush, setter) => {
    selectBrush(brush);
    setter(false);
    expect(toolState.brush).toBe('pen');
    expect(localStorage.getItem(STORAGE_KEYS.brushType)).toBe('pen');
  });
});

describe('setSoundVolume', () => {
  it('updates the live store and persists the volume percentage', () => {
    setSoundVolume(75);
    expect(settings.soundVolume).toBe(75);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('75');
  });

  it('clamps stored volume between 0 and 100', () => {
    setSoundVolume(125);
    expect(settings.soundVolume).toBe(100);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('100');

    setSoundVolume(-10);
    expect(settings.soundVolume).toBe(0);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('0');
  });

  it('falls back to normal volume for invalid values', () => {
    setSoundVolume(NaN);
    expect(settings.soundVolume).toBe(50);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('50');
  });
});

describe('setActionButtonScale', () => {
  it('updates the live store and persists the scale percentage', () => {
    setActionButtonScale(120);
    expect(settings.actionButtonScale).toBe(120);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe('120');
  });

  it('clamps stored scale to the allowed range', () => {
    setActionButtonScale(999);
    expect(settings.actionButtonScale).toBe(ACTION_BUTTON_SCALE_MAX);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe(
      String(ACTION_BUTTON_SCALE_MAX)
    );

    setActionButtonScale(0);
    expect(settings.actionButtonScale).toBe(ACTION_BUTTON_SCALE_MIN);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe(
      String(ACTION_BUTTON_SCALE_MIN)
    );
  });

  it('falls back to the default scale for invalid values', () => {
    setActionButtonScale(NaN);
    expect(settings.actionButtonScale).toBe(ACTION_BUTTON_SCALE_DEFAULT);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe(
      String(ACTION_BUTTON_SCALE_DEFAULT)
    );
  });
});

describe('setTheme', () => {
  it('persists the choice and stamps data-theme on <html>', () => {
    setTheme('dark');
    expect(settings.theme).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('system clears the attribute so the prefers-color-scheme CSS drives the theme', () => {
    setTheme('dark');
    setTheme('system');
    expect(settings.theme).toBe('system');
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('reloadSettings', () => {
  it('re-reads every persisted setting into the live store (durable-recovery path)', () => {
    // Simulate values recovered into localStorage by the durable layer after a
    // WebView eviction, differing from the current in-memory state.
    setSound(true);
    setDrawerOpen(false);
    localStorage.setItem(STORAGE_KEYS.soundEnabled, 'false');
    localStorage.setItem(STORAGE_KEYS.soundVolume, '35');
    localStorage.setItem(STORAGE_KEYS.actionButtonScale, '130');
    localStorage.setItem(STORAGE_KEYS.drawerOpen, 'true');
    localStorage.setItem(STORAGE_KEYS.theme, 'dark');

    reloadSettings();

    expect(settings.soundEnabled).toBe(false);
    expect(settings.soundVolume).toBe(35);
    expect(settings.actionButtonScale).toBe(130);
    expect(settings.drawerOpen).toBe(true);
    expect(settings.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('keeps the current value when a key is absent', () => {
    setEraser(false);
    localStorage.removeItem(STORAGE_KEYS.eraserEnabled);
    reloadSettings();
    expect(settings.eraserEnabled).toBe(false);
  });

  it('keeps the current theme when the stored value is invalid', () => {
    setTheme('dark');
    localStorage.setItem(STORAGE_KEYS.theme, 'blorange');
    reloadSettings();
    expect(settings.theme).toBe('dark');
  });
});

describe('aiCredentialKind', () => {
  beforeEach(() => {
    settings.aiUserApiKey = '';
    settings.aiAccessToken = '';
  });

  it('returns apiKey when only the BYOK key is set', () => {
    settings.aiUserApiKey = 'user-key';
    expect(aiCredentialKind()).toBe('apiKey');
  });

  it('returns accessCode when only the access token is set', () => {
    settings.aiAccessToken = 'access-token';
    expect(aiCredentialKind()).toBe('accessCode');
  });

  it('returns none when neither credential is set', () => {
    expect(aiCredentialKind()).toBe('none');
  });

  it('prefers apiKey when both credentials are set', () => {
    settings.aiUserApiKey = 'user-key';
    settings.aiAccessToken = 'access-token';
    expect(aiCredentialKind()).toBe('apiKey');
  });
});
