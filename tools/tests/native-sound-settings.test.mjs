import { describe, expect, it, vi } from 'vitest';
import {
  createSoundSettings,
  MAX_SETTINGS_BYTES,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';

function pending() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}
function fixture(snapshot = null) {
  const changes = [];
  const storage = { read: vi.fn(async () => snapshot), write: vi.fn(async () => {}) };
  const settings = createSoundSettings(storage, (state) => changes.push(state));
  return { changes, storage, settings };
}
describe('candidate sound settings', () => {
  it.each([true, false])('restores exactly the persisted %s choice', async (soundEnabled) => {
    const f = fixture(JSON.stringify({ version: 1, soundEnabled }));
    await f.settings.load();
    expect(f.changes).toEqual([{ status: 'ready', soundEnabled, saved: true, message: '' }]);
  });
  it('enables sound for a new installation after the storage read completes', async () => {
    const f = fixture();
    await f.settings.load();
    expect(f.changes.at(-1)).toMatchObject({ status: 'ready', soundEnabled: true, saved: true });
    expect(f.storage.write).not.toHaveBeenCalled();
  });
  it.each([
    'null',
    '[]',
    '{}',
    '{"version":2,"soundEnabled":true}',
    '{"version":1,"soundEnabled":"false"}',
    '{"version":1,"soundEnabled":true,"legacy":false}',
    '{"version":1,"soundEnabled":true,"soundEnabled":false}',
    '{"soundEnabled":true,"version":1}',
    ' {"version":1,"soundEnabled":true}',
    'not JSON',
    ' '.repeat(MAX_SETTINGS_BYTES + 1),
  ])('rejects malformed or noncanonical persisted settings %s', (snapshot) => {
    expect(() => parseSoundSettings(snapshot)).toThrow();
  });
  it('keeps sound off and offers recovery after a failed read', async () => {
    const f = fixture();
    f.storage.read.mockRejectedValue(new Error('permission denied'));
    await f.settings.load();
    expect(f.changes.at(-1)).toMatchObject({ soundEnabled: false, saved: false });
    expect(f.changes.at(-1).message).toContain('could not be read');
    await f.settings.setEnabled(true);
    expect(f.storage.write).toHaveBeenCalledWith('{"version":1,"soundEnabled":true}');
    expect(f.changes.at(-1)).toMatchObject({ soundEnabled: true, saved: true });
  });
  it('applies mute immediately, retains a failed choice, and retries that exact snapshot', async () => {
    const f = fixture();
    await f.settings.load();
    const save = pending();
    f.storage.write.mockReturnValueOnce(save.promise);
    const write = f.settings.setEnabled(false);
    expect(f.changes.at(-1)).toMatchObject({ status: 'saving', soundEnabled: false });
    save.reject(new Error('disk full'));
    await write;
    expect(f.changes.at(-1)).toMatchObject({ status: 'ready', soundEnabled: false, saved: false });
    await f.settings.retrySave();
    expect(f.storage.write.mock.calls).toEqual([
      ['{"version":1,"soundEnabled":false}'],
      ['{"version":1,"soundEnabled":false}'],
    ]);
    expect(f.changes.at(-1)).toMatchObject({ status: 'ready', soundEnabled: false, saved: true });
  });
  it('admits no second writer while saving', async () => {
    const f = fixture();
    await f.settings.load();
    const save = pending();
    f.storage.write.mockReturnValueOnce(save.promise);
    const write = f.settings.setEnabled(false);
    await f.settings.setEnabled(true);
    await f.settings.retrySave();
    expect(f.storage.write).toHaveBeenCalledTimes(1);
    save.resolve();
    await write;
    expect(f.changes.at(-1)).toMatchObject({ soundEnabled: false, saved: true });
  });
  it('ignores hydration after the owner unmounts', async () => {
    const f = fixture();
    const read = pending();
    f.storage.read.mockReturnValueOnce(read.promise);
    const loading = f.settings.load();
    f.settings.dispose();
    read.resolve('{"version":1,"soundEnabled":true}');
    await loading;
    expect(f.changes).toEqual([]);
    await f.settings.setEnabled(true);
    expect(f.storage.write).not.toHaveBeenCalled();
  });
  it('does not publish a late save result after the owner unmounts', async () => {
    const f = fixture();
    await f.settings.load();
    const save = pending();
    f.storage.write.mockReturnValueOnce(save.promise);
    const writing = f.settings.setEnabled(false);
    f.settings.dispose();
    save.resolve();
    await writing;
    expect(f.changes.at(-1)).toMatchObject({ status: 'saving', soundEnabled: false });
  });
});
