import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory stand-in for secure storage (Keychain/Keystore on native, the
// encrypted IndexedDB payload on the web) so hydrateApiKey's migration can be
// exercised without a real platform vault.
const secureStore = vi.hoisted(() => ({ apiKey: null as string | null }));

vi.mock('../secureStorage', () => ({
  saveApiKey: vi.fn(async (value: string) => {
    secureStore.apiKey = value;
  }),
  loadApiKey: vi.fn(async () => secureStore.apiKey),
  clearApiKey: vi.fn(async () => {
    secureStore.apiKey = null;
  }),
  requestPersistentStorage: vi.fn(async () => false),
}));

import {
  settings,
  setSound,
  setSoundVolume,
  setActionButtonScale,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
  ACTION_BUTTON_SCALE_DEFAULT,
  setEraser,
  setDrawerOpen,
  setAiAccessToken,
  setTheme,
  reloadSettings,
  hydrateApiKey,
  setAiUserApiKey,
} from './settings.svelte';
import { saveApiKey } from '../secureStorage';

const SOUND_KEY = 'splotch-sound-enabled';
const SOUND_VOLUME_KEY = 'splotch-sound-volume';
const ACTION_BUTTON_SCALE_KEY = 'splotch-action-button-scale';
const ERASER_KEY = 'splotch-eraser-enabled';
const DRAWER_OPEN_KEY = 'splotch-drawer-open';
const AI_ACCESS_TOKEN_KEY = 'splotch-ai-access-token';
const LEGACY_AI_USER_API_KEY = 'splotch-ai-user-api-key';
const THEME_KEY = 'splotch-theme';

beforeEach(() => {
  localStorage.clear();
  secureStore.apiKey = null;
  settings.aiUserApiKey = '';
  vi.mocked(saveApiKey)
    .mockReset()
    .mockImplementation(async (value: string) => {
      secureStore.apiKey = value;
    });
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

describe('setActionButtonScale', () => {
  it('updates the live store and persists the scale percentage', () => {
    setActionButtonScale(120);
    expect(settings.actionButtonScale).toBe(120);
    expect(localStorage.getItem(ACTION_BUTTON_SCALE_KEY)).toBe('120');
  });

  it('clamps stored scale to the allowed range', () => {
    setActionButtonScale(999);
    expect(settings.actionButtonScale).toBe(ACTION_BUTTON_SCALE_MAX);
    expect(localStorage.getItem(ACTION_BUTTON_SCALE_KEY)).toBe(String(ACTION_BUTTON_SCALE_MAX));

    setActionButtonScale(0);
    expect(settings.actionButtonScale).toBe(ACTION_BUTTON_SCALE_MIN);
    expect(localStorage.getItem(ACTION_BUTTON_SCALE_KEY)).toBe(String(ACTION_BUTTON_SCALE_MIN));
  });

  it('falls back to the default scale for invalid values', () => {
    setActionButtonScale(NaN);
    expect(settings.actionButtonScale).toBe(ACTION_BUTTON_SCALE_DEFAULT);
    expect(localStorage.getItem(ACTION_BUTTON_SCALE_KEY)).toBe(String(ACTION_BUTTON_SCALE_DEFAULT));
  });
});

describe('setAiAccessToken', () => {
  it('persists the token verbatim as a string', () => {
    setAiAccessToken('abc123');
    expect(settings.aiAccessToken).toBe('abc123');
    expect(localStorage.getItem(AI_ACCESS_TOKEN_KEY)).toBe('abc123');
  });
});

describe('setAiUserApiKey', () => {
  it('commits the live key only after secure persistence succeeds', async () => {
    let finishSave!: () => void;
    vi.mocked(saveApiKey).mockImplementationOnce(
      (value: string) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            secureStore.apiKey = value;
            resolve();
          };
        })
    );

    const saving = setAiUserApiKey('AIza-persisted');
    await vi.waitFor(() => expect(saveApiKey).toHaveBeenCalledOnce());

    expect(settings.aiUserApiKey).toBe('');
    finishSave();
    await saving;

    expect(settings.aiUserApiKey).toBe('AIza-persisted');
    expect(secureStore.apiKey).toBe('AIza-persisted');
  });

  it('keeps the live key empty when secure persistence rejects', async () => {
    vi.mocked(saveApiKey).mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(setAiUserApiKey('AIza-rejected')).rejects.toThrow('secure storage unavailable');

    expect(settings.aiUserApiKey).toBe('');
    expect(secureStore.apiKey).toBeNull();
  });
});

describe('setTheme', () => {
  it('persists the choice and stamps data-theme on <html>', () => {
    setTheme('dark');
    expect(settings.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('system clears the attribute so the prefers-color-scheme CSS drives the theme', () => {
    setTheme('dark');
    setTheme('system');
    expect(settings.theme).toBe('system');
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
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
    localStorage.setItem(ACTION_BUTTON_SCALE_KEY, '130');
    localStorage.setItem(DRAWER_OPEN_KEY, 'true');
    localStorage.setItem(AI_ACCESS_TOKEN_KEY, 'recovered-token');
    localStorage.setItem(THEME_KEY, 'dark');

    reloadSettings();

    expect(settings.soundEnabled).toBe(false);
    expect(settings.soundVolume).toBe(35);
    expect(settings.actionButtonScale).toBe(130);
    expect(settings.drawerOpen).toBe(true);
    expect(settings.aiAccessToken).toBe('recovered-token');
    expect(settings.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('keeps the current value when a key is absent', () => {
    setEraser(false);
    localStorage.removeItem(ERASER_KEY);
    reloadSettings();
    expect(settings.eraserEnabled).toBe(false);
  });

  it('keeps the current theme when the stored value is invalid', () => {
    setTheme('dark');
    localStorage.setItem(THEME_KEY, 'blorange');
    reloadSettings();
    expect(settings.theme).toBe('dark');
  });
});

describe('hydrateApiKey', () => {
  it('hydrates the live store from secure storage', async () => {
    secureStore.apiKey = 'stored-key';
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('stored-key');
  });

  it('leaves the store empty when nothing is saved anywhere', async () => {
    await hydrateApiKey();
    expect(settings.aiUserApiKey).toBe('');
    expect(secureStore.apiKey).toBeNull();
  });

  it('migrates a legacy plaintext key into secure storage and scrubs the plaintext copy', async () => {
    localStorage.setItem(LEGACY_AI_USER_API_KEY, 'legacy-key');

    await hydrateApiKey();

    expect(settings.aiUserApiKey).toBe('legacy-key');
    expect(secureStore.apiKey).toBe('legacy-key');
    expect(localStorage.getItem(LEGACY_AI_USER_API_KEY)).toBeNull();
  });

  it('prefers the secure copy over a stale legacy plaintext key', async () => {
    secureStore.apiKey = 'secure-key';
    localStorage.setItem(LEGACY_AI_USER_API_KEY, 'stale-legacy-key');

    await hydrateApiKey();

    expect(settings.aiUserApiKey).toBe('secure-key');
    expect(secureStore.apiKey).toBe('secure-key');
  });

  it('two boots racing the legacy migration both end with the key intact', async () => {
    localStorage.setItem(LEGACY_AI_USER_API_KEY, 'legacy-key');

    await Promise.all([hydrateApiKey(), hydrateApiKey()]);

    expect(settings.aiUserApiKey).toBe('legacy-key');
    expect(secureStore.apiKey).toBe('legacy-key');
    expect(localStorage.getItem(LEGACY_AI_USER_API_KEY)).toBeNull();
  });
});
