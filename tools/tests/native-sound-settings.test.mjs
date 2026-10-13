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
    expect(f.changes).toEqual([
      {
        status: 'ready',
        soundEnabled,
        strokeWidth: 'medium',
        eraserWidth: 'medium',
        selectedColor: 'Purple',
        customColors: [],
        appearance: 'system',
        aiEnabled: false,
        parentPolicies: {
          ai: 'always',
          imageReport: 'always',
          feedback: 'always',
          parentCenter: 'always',
        },
        coloringBookEnabled: true,
        soundLevel: 'medium',
        undoButtonEnabled: true,
        strokeWidthControlEnabled: true,
        orientation: 'portrait',
        saveOnDeleteEnabled: false,
        saved: true,
        message: '',
      },
    ]);
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
    expect(f.storage.write).not.toHaveBeenCalled();
    await f.settings.retrySave();
    expect(f.storage.write).not.toHaveBeenCalled();
    f.storage.read.mockResolvedValueOnce('{"version":1,"soundEnabled":false}');
    await f.settings.retryRead();
    expect(f.changes.at(-1)).toMatchObject({ soundEnabled: false, saved: true });
    expect(f.storage.write).not.toHaveBeenCalled();
    await f.settings.setEnabled(true);
    expect(f.storage.write).toHaveBeenCalledWith(
      '{"version":9,"soundEnabled":true,"strokeWidth":"medium","eraserWidth":"medium","selectedColor":"Purple","customColors":[],"appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundLevel":"medium","undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false}'
    );
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
      [
        '{"version":9,"soundEnabled":false,"strokeWidth":"medium","eraserWidth":"medium","selectedColor":"Purple","customColors":[],"appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundLevel":"medium","undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false}',
      ],
      [
        '{"version":9,"soundEnabled":false,"strokeWidth":"medium","eraserWidth":"medium","selectedColor":"Purple","customColors":[],"appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundLevel":"medium","undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false}',
      ],
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
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'normalizes legacy schema %s to Medium without writing',
    async (version) => {
      const old = { version, soundEnabled: false };
      if (version >= 2) Object.assign(old, { strokeWidth: 'medium', eraserWidth: 'medium' });
      if (version >= 3) Object.assign(old, { selectedColor: 'Purple', customColors: [] });
      if (version >= 4) Object.assign(old, { appearance: 'system' });
      if (version >= 5)
        Object.assign(old, {
          aiEnabled: false,
          parentPolicies:
            version === 7
              ? { ai: 'never', imageReport: 'session', feedback: 'always', parentCenter: 'session' }
              : { ai: 'never', feedback: 'always', parentCenter: 'session' },
        });
      if (version >= 6) Object.assign(old, { coloringBookEnabled: false });
      const f = fixture(JSON.stringify(old));
      await f.settings.load();
      expect(f.changes.at(-1)).toMatchObject({
        soundLevel: 'medium',
        undoButtonEnabled: true,
        strokeWidthControlEnabled: true,
        soundEnabled: false,
        saved: true,
      });
      expect(f.storage.write).not.toHaveBeenCalled();
      expect(() => parseSoundSettings(JSON.stringify({ ...old, soundLevel: 'invalid' }))).toThrow();
    }
  );
  it.each(['quiet', 'medium', 'loud'])(
    'round-trips %s independently of mute and all four parent policies',
    async (soundLevel) => {
      const f = fixture();
      await f.settings.load();
      await f.settings.setEnabled(false);
      const parentPolicies = {
        ai: 'never',
        imageReport: 'session',
        feedback: 'always',
        parentCenter: 'session',
      };
      await f.settings.setParentPreferences({ aiEnabled: true, parentPolicies });
      await f.settings.setSoundLevel(soundLevel);
      const stored = f.storage.write.mock.calls.at(-1)[0];
      expect(parseSoundSettings(stored)).toMatchObject({
        version: 9,
        soundEnabled: false,
        soundLevel,
        aiEnabled: true,
        parentPolicies,
      });
      const reopened = fixture(stored);
      await reopened.settings.load();
      expect(reopened.changes.at(-1)).toMatchObject({
        soundEnabled: false,
        soundLevel,
        parentPolicies,
      });
      const {
        soundLevel: _level,
        undoButtonEnabled,
        strokeWidthControlEnabled,
        orientation: _orientation,
        saveOnDeleteEnabled: _saveOnDelete,
        ...withoutLevel
      } = JSON.parse(stored);
      expect(
        parseSoundSettings(
          JSON.stringify({
            ...withoutLevel,
            version: 7,
            undoButtonEnabled,
            strokeWidthControlEnabled,
          })
        ).soundLevel
      ).toBe('medium');
      expect(() =>
        parseSoundSettings(JSON.stringify({ ...JSON.parse(stored), soundLevel: undefined }))
      ).toThrow();
      for (const invalid of ['LOUD', '', null, 2, {}, ['quiet']]) {
        expect(() =>
          parseSoundSettings(JSON.stringify({ ...withoutLevel, soundLevel: invalid }))
        ).toThrow('Sound level');
      }
      expect(() =>
        parseSoundSettings(JSON.stringify({ ...withoutLevel, soundLevel, unknown: true }))
      ).toThrow();
    }
  );
  it('applies a failed level save for the session and retries that exact level', async () => {
    const f = fixture();
    await f.settings.load();
    const save = pending();
    f.storage.write.mockReturnValueOnce(save.promise);
    const writing = f.settings.setSoundLevel('quiet');
    expect(f.changes.at(-1)).toMatchObject({ status: 'saving', soundLevel: 'quiet' });
    await f.settings.setSoundLevel('loud');
    expect(f.storage.write).toHaveBeenCalledOnce();
    save.reject(new Error('disk full'));
    await writing;
    expect(f.changes.at(-1)).toMatchObject({ soundLevel: 'quiet', saved: false });
    await f.settings.retrySave();
    expect(f.storage.write.mock.calls[1]).toEqual(f.storage.write.mock.calls[0]);
    expect(f.changes.at(-1)).toMatchObject({ soundLevel: 'quiet', saved: true });
  });
  it('keeps level edits session-only after a failed read and rejects an invalid choice', async () => {
    const f = fixture();
    f.storage.read.mockRejectedValueOnce(new Error('denied'));
    await f.settings.load();
    await f.settings.setSoundLevel('loud');
    await f.settings.retrySave();
    expect(f.changes.at(-1)).toMatchObject({
      soundLevel: 'loud',
      soundEnabled: false,
      saved: false,
    });
    expect(f.storage.write).not.toHaveBeenCalled();
    await expect(f.settings.setSoundLevel('invalid')).rejects.toThrow('Sound level');
  });
});
