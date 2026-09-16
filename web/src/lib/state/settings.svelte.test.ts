import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../storage';

import {
  settingsState,
  setDeleteSound,
  setDrawingSound,
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
  createSettings,
  type SettingsState,
} from './settings.svelte';
import { createTool, selectBrush, toolState } from './tool.svelte';

beforeEach(() => {
  setSound(true);
  setDrawingSound(true);
  setDeleteSound(true);
  setCrayon(true);
  setMagicBrush(true);
  setEraser(true);
  selectBrush('pen');
  localStorage.clear();
});

describe('defaults', () => {
  it('enumerates fields without mutator methods', () => {
    const settings = createSettings(createTool());

    expect(Object.keys(settings)).toEqual(
      expect.arrayContaining(['theme', 'toolbarStyle', 'soundEnabled'])
    );
    expect(Object.values(settings).map((value) => typeof value)).not.toContain('function');
  });

  it('enables both sound sources for existing installs without source preferences', () => {
    const freshSettings = createSettings(createTool());

    expect(freshSettings.drawingSoundEnabled).toBe(true);
    expect(freshSettings.deleteSoundEnabled).toBe(true);
  });

  it('keeps AI image creation off until a parent opts in', () => {
    expect(settingsState.aiImageEnabled).toBe(false);
  });
});

describe('boolean setters', () => {
  it('updates the live store and persists to localStorage', () => {
    setSound(false);
    expect(settingsState.soundEnabled).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBe('false');

    setSound(true);
    expect(settingsState.soundEnabled).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBe('true');
  });

  it('each setter writes only its own key', () => {
    setEraser(false);
    expect(settingsState.eraserEnabled).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.eraserEnabled)).toBe('false');
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBeNull();
  });

  it.each([
    ['drawing sound', setDrawingSound, STORAGE_KEYS.drawingSoundEnabled],
    ['delete sound', setDeleteSound, STORAGE_KEYS.deleteSoundEnabled],
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
    expect(settingsState.soundVolume).toBe(75);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('75');
  });

  it('clamps stored volume between 0 and 100', () => {
    setSoundVolume(125);
    expect(settingsState.soundVolume).toBe(100);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('100');

    setSoundVolume(-10);
    expect(settingsState.soundVolume).toBe(0);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('0');
  });

  it('falls back to normal volume for invalid values', () => {
    setSoundVolume(NaN);
    expect(settingsState.soundVolume).toBe(50);
    expect(localStorage.getItem(STORAGE_KEYS.soundVolume)).toBe('50');
  });
});

describe('setActionButtonScale', () => {
  it('updates the live store and persists the scale percentage', () => {
    setActionButtonScale(120);
    expect(settingsState.actionButtonScale).toBe(120);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe('120');
  });

  it('clamps stored scale to the allowed range', () => {
    setActionButtonScale(999);
    expect(settingsState.actionButtonScale).toBe(ACTION_BUTTON_SCALE_MAX);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe(
      String(ACTION_BUTTON_SCALE_MAX)
    );

    setActionButtonScale(0);
    expect(settingsState.actionButtonScale).toBe(ACTION_BUTTON_SCALE_MIN);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe(
      String(ACTION_BUTTON_SCALE_MIN)
    );
  });

  it('falls back to the default scale for invalid values', () => {
    setActionButtonScale(NaN);
    expect(settingsState.actionButtonScale).toBe(ACTION_BUTTON_SCALE_DEFAULT);
    expect(localStorage.getItem(STORAGE_KEYS.actionButtonScale)).toBe(
      String(ACTION_BUTTON_SCALE_DEFAULT)
    );
  });
});

describe('setTheme', () => {
  it('persists the choice and stamps data-theme on <html>', () => {
    setTheme('dark');
    expect(settingsState.theme).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('system clears the attribute so the prefers-color-scheme CSS drives the theme', () => {
    setTheme('dark');
    setTheme('system');
    expect(settingsState.theme).toBe('system');
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('reloadSettings', () => {
  it('re-reads every persisted setting into the live store (durable-recovery path)', () => {
    // Simulate values recovered into localStorage by the durable layer after a
    // WebView eviction, differing from the current in-memory state.
    setSound(true);
    setDrawingSound(true);
    setDeleteSound(true);
    setDrawerOpen(false);
    localStorage.setItem(STORAGE_KEYS.soundEnabled, 'false');
    localStorage.setItem(STORAGE_KEYS.drawingSoundEnabled, 'false');
    localStorage.setItem(STORAGE_KEYS.deleteSoundEnabled, 'false');
    localStorage.setItem(STORAGE_KEYS.soundVolume, '35');
    localStorage.setItem(STORAGE_KEYS.actionButtonScale, '130');
    localStorage.setItem(STORAGE_KEYS.drawerOpen, 'true');
    localStorage.setItem(STORAGE_KEYS.theme, 'dark');

    reloadSettings();

    expect(settingsState.soundEnabled).toBe(false);
    expect(settingsState.drawingSoundEnabled).toBe(false);
    expect(settingsState.deleteSoundEnabled).toBe(false);
    expect(settingsState.soundVolume).toBe(35);
    expect(settingsState.actionButtonScale).toBe(130);
    expect(settingsState.drawerOpen).toBe(true);
    expect(settingsState.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('keeps the current value when a key is absent', () => {
    setEraser(false);
    localStorage.removeItem(STORAGE_KEYS.eraserEnabled);
    reloadSettings();
    expect(settingsState.eraserEnabled).toBe(false);
  });

  it('keeps the current theme when the stored value is invalid', () => {
    setTheme('dark');
    localStorage.setItem(STORAGE_KEYS.theme, 'blorange');
    reloadSettings();
    expect(settingsState.theme).toBe('dark');
  });
});

describe('aiCredentialKind', () => {
  let settings: SettingsState;

  beforeEach(() => {
    settings = createSettings(createTool());
  });

  it('returns apiKey when only the BYOK key is set', () => {
    settings.mirrorAiUserApiKey('user-key');
    expect(settings.aiCredentialKind()).toBe('apiKey');
  });

  it('returns accessCode when only the access token is set', () => {
    settings.mirrorAiAccessToken('access-token');
    expect(settings.aiCredentialKind()).toBe('accessCode');
  });

  it('returns none when neither credential is set', () => {
    expect(settings.aiCredentialKind()).toBe('none');
  });

  it('prefers apiKey when both credentials are set', () => {
    settings.mirrorAiUserApiKey('user-key');
    settings.mirrorAiAccessToken('access-token');
    expect(settings.aiCredentialKind()).toBe('apiKey');
  });

  it('refuses a write into the read-only view', () => {
    expect(() => {
      Object.assign(settings, { aiUserApiKey: 'smuggled' });
    }).toThrow(TypeError);
    expect(settings.aiUserApiKey).toBe('');
  });
});
