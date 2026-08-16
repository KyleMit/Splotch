import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '$lib/storage';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function freshSessionCounters() {
  return import('./sessionCounters.svelte');
}

describe('session counters', () => {
  it('keeps Settings dots disabled through the fifth session and records once per document', async () => {
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '4');
    const counters = await freshSessionCounters();

    counters.recordSession('settingsActivity');
    counters.recordSession('settingsActivity');

    expect(localStorage.getItem(STORAGE_KEYS.settingsActivitySessionCount)).toBe('5');
    expect(counters.sessionCount('settingsActivity')).toBe(5);
  });

  it('enables the Settings milestone on the sixth session', async () => {
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '5');
    const counters = await freshSessionCounters();

    counters.recordSession('settingsActivity');

    expect(counters.sessionCount('settingsActivity')).toBe(
      counters.SETTINGS_ACTIVITY_DOTS_START_SESSION
    );
  });

  it('tracks the two feature counters independently', async () => {
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '5');
    localStorage.setItem(STORAGE_KEYS.installRepromptSessionCount, '4');
    const counters = await freshSessionCounters();

    counters.recordSession('settingsActivity');
    counters.recordSession('installReprompt');
    counters.clearSessionCount('installReprompt');

    expect(counters.sessionCount('settingsActivity')).toBe(6);
    expect(counters.sessionCount('installReprompt')).toBe(0);
    expect(localStorage.getItem(STORAGE_KEYS.installRepromptSessionCount)).toBeNull();
  });

  it('saturates each persisted count at its final milestone', async () => {
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '6');
    localStorage.setItem(STORAGE_KEYS.installRepromptSessionCount, '10');
    const counters = await freshSessionCounters();

    counters.recordSession('settingsActivity');
    counters.recordSession('installReprompt');

    expect(counters.sessionCount('settingsActivity')).toBe(6);
    expect(counters.sessionCount('installReprompt')).toBe(10);
  });
});
