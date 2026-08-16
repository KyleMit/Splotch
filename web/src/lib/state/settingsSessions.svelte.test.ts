import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '$lib/storage';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function freshSessionStore() {
  return import('./settingsSessions.svelte');
}

describe('Settings activity sessions', () => {
  it('keeps dots disabled through the fifth session and records once per document', async () => {
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '4');
    const session = await freshSessionStore();

    session.recordSettingsActivitySession();
    session.recordSettingsActivitySession();

    expect(localStorage.getItem(STORAGE_KEYS.settingsActivitySessionCount)).toBe('5');
    expect(session.settingsActivityDotsEnabled()).toBe(false);
  });

  it('enables dots on the sixth session', async () => {
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '5');
    const session = await freshSessionStore();

    session.recordSettingsActivitySession();

    expect(localStorage.getItem(STORAGE_KEYS.settingsActivitySessionCount)).toBe('6');
    expect(session.settingsActivityDotsEnabled()).toBe(true);
  });

  it('saturates the persisted count once dots are enabled', async () => {
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '6');
    const session = await freshSessionStore();

    session.recordSettingsActivitySession();

    expect(localStorage.getItem(STORAGE_KEYS.settingsActivitySessionCount)).toBe('6');
    expect(session.settingsActivityDotsEnabled()).toBe(true);
  });
});
