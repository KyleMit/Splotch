import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { soundSettingsStorage } from '../../experiments/native-architecture/src/platform/soundSettings.web.ts';
import { createSoundSettings } from '../../experiments/native-architecture/src/settings/soundSettings.ts';
let storage;
beforeEach(() => {
  const values = new Map();
  storage = {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());
describe('web sound settings persistence', () => {
  it('round-trips the actual owner snapshot through its own key', async () => {
    const states = [];
    const owner = createSoundSettings(soundSettingsStorage, (state) => states.push(state));
    await owner.load();
    await owner.setEnabled(false);
    expect(storage.setItem).toHaveBeenCalledWith(
      'splotch-candidate:sound-v1',
      '{"version":1,"soundEnabled":false}'
    );
    const reopened = createSoundSettings(soundSettingsStorage, (state) => states.push(state));
    await reopened.load();
    expect(states.at(-1)).toMatchObject({ soundEnabled: false, saved: true });
    owner.dispose();
    reopened.dispose();
  });
  it('keeps sound muted when localStorage read throws', async () => {
    storage.getItem.mockImplementation(() => {
      throw new Error('storage denied');
    });
    const states = [];
    const owner = createSoundSettings(soundSettingsStorage, (state) => states.push(state));
    await owner.load();
    expect(states.at(-1)).toMatchObject({ soundEnabled: false, saved: false });
    expect(states.at(-1).message).toContain('could not be read');
    owner.dispose();
  });
  it('retains the session choice and allows retry after a write throws', async () => {
    const states = [];
    const owner = createSoundSettings(soundSettingsStorage, (state) => states.push(state));
    await owner.load();
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    await owner.setEnabled(false);
    expect(states.at(-1)).toMatchObject({ soundEnabled: false, saved: false });
    await owner.retrySave();
    expect(states.at(-1)).toMatchObject({ soundEnabled: false, saved: true });
    owner.dispose();
  });
  it('rejects a lying readback instead of marking an unverified write saved', async () => {
    storage.setItem.mockImplementation(() => {});
    await expect(soundSettingsStorage.write('{"version":1,"soundEnabled":true}')).rejects.toThrow(
      'could not be verified'
    );
  });
});
