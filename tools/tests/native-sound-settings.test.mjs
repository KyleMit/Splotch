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
const SOUND_DEFAULTS = { soundVolume: 50, drawingSoundEnabled: true, deleteSoundEnabled: true };

async function currentSnapshot() {
  const f = fixture();
  await f.settings.load();
  await f.settings.setEnabled(false);
  return f.storage.write.mock.calls.at(-1)[0];
}

// The schema 11 record a current one replaced: a level where the volume and sources sit, and no
// Button style.
function legacyRecord(current, soundLevel) {
  const legacy = {};
  for (const [key, value] of Object.entries(current)) {
    if (key === 'version') legacy.version = 11;
    else if (key === 'soundVolume') legacy.soundLevel = soundLevel;
    else if (!['drawingSoundEnabled', 'deleteSoundEnabled', 'toolbarStyle'].includes(key))
      legacy[key] = value;
  }
  return legacy;
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
        soundVolume: 50,
        drawingSoundEnabled: true,
        deleteSoundEnabled: true,
        undoButtonEnabled: true,
        strokeWidthControlEnabled: true,
        orientation: 'portrait',
        saveOnDeleteEnabled: false,
        buttonScale: 100,
        reduceMotion: 'system',
        whatsNewSeen: null,
        pencilEraserEnabled: true,
        applePencilSeen: false,
        toolbarStyle: 'buttons',
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
      '{"version":12,"soundEnabled":true,"strokeWidth":"medium","eraserWidth":"medium","selectedColor":"Purple","customColors":[],"appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons"}'
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
        '{"version":12,"soundEnabled":false,"strokeWidth":"medium","eraserWidth":"medium","selectedColor":"Purple","customColors":[],"appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons"}',
      ],
      [
        '{"version":12,"soundEnabled":false,"strokeWidth":"medium","eraserWidth":"medium","selectedColor":"Purple","customColors":[],"appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons"}',
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
    'normalizes legacy schema %s to the shipping volume and both sources without writing',
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
        ...SOUND_DEFAULTS,
        toolbarStyle: 'buttons',
        undoButtonEnabled: true,
        strokeWidthControlEnabled: true,
        soundEnabled: false,
        saved: true,
      });
      expect(f.storage.write).not.toHaveBeenCalled();
      expect(() => parseSoundSettings(JSON.stringify({ ...old, soundLevel: 'invalid' }))).toThrow();
    }
  );
  it.each([
    ['quiet', 25],
    ['medium', 50],
    ['loud', 100],
  ])(
    'migrates a stored %s level to the volume that plays at its gain, both sources on',
    async (soundLevel, soundVolume) => {
      const stored = JSON.parse(await currentSnapshot());
      const legacy = legacyRecord(stored, soundLevel);
      const f = fixture(JSON.stringify(legacy));
      await f.settings.load();
      expect(f.changes.at(-1)).toMatchObject({
        soundVolume,
        drawingSoundEnabled: true,
        deleteSoundEnabled: true,
        toolbarStyle: 'buttons',
        saved: true,
      });
      expect(f.storage.write).not.toHaveBeenCalled();
      for (const invalid of ['LOUD', '', null, 2, {}, ['quiet']])
        expect(() => parseSoundSettings(JSON.stringify(legacyRecord(stored, invalid)))).toThrow(
          'Sound level'
        );
      const { soundLevel: _level, ...withoutLevel } = legacy;
      expect(() => parseSoundSettings(JSON.stringify(withoutLevel))).toThrow('Sound level');
    }
  );
  it('round-trips volume, sources and Button style independently of mute and parent policies', async () => {
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
    await f.settings.setSoundVolume(73);
    await f.settings.setDrawingSoundEnabled(false);
    await f.settings.setDeleteSoundEnabled(false);
    await f.settings.setToolbarStyle('bare');
    const stored = f.storage.write.mock.calls.at(-1)[0];
    const chosen = {
      soundEnabled: false,
      soundVolume: 73,
      drawingSoundEnabled: false,
      deleteSoundEnabled: false,
      toolbarStyle: 'bare',
    };
    expect(parseSoundSettings(stored)).toMatchObject({
      version: 12,
      ...chosen,
      aiEnabled: true,
      parentPolicies,
    });
    const reopened = fixture(stored);
    await reopened.settings.load();
    expect(reopened.changes.at(-1)).toMatchObject({ ...chosen, parentPolicies, saved: true });
    const current = JSON.parse(stored);
    for (const [key, invalid] of [
      ['soundVolume', -1],
      ['soundVolume', 101],
      ['soundVolume', 50.5],
      ['soundVolume', '50'],
      ['soundVolume', undefined],
      ['drawingSoundEnabled', 'yes'],
      ['drawingSoundEnabled', undefined],
      ['deleteSoundEnabled', 0],
      ['toolbarStyle', 'flat'],
      ['toolbarStyle', undefined],
      ['soundLevel', 'medium'],
    ])
      expect(
        () => parseSoundSettings(JSON.stringify({ ...current, [key]: invalid })),
        `${key} ${invalid}`
      ).toThrow();
  });
  it('rejects invalid volume, source and Button style choices without writing', async () => {
    const f = fixture();
    await f.settings.load();
    await expect(f.settings.setSoundVolume(101)).rejects.toThrow('Volume');
    await expect(f.settings.setSoundVolume(12.5)).rejects.toThrow('Volume');
    await expect(f.settings.setDrawingSoundEnabled('off')).rejects.toThrow('Sound source');
    await expect(f.settings.setDeleteSoundEnabled(null)).rejects.toThrow('Sound source');
    await expect(f.settings.setToolbarStyle('flat')).rejects.toThrow('Button style');
    expect(f.storage.write).not.toHaveBeenCalled();
  });
  it('applies a failed volume save for the session and retries that exact volume', async () => {
    const f = fixture();
    await f.settings.load();
    const save = pending();
    f.storage.write.mockReturnValueOnce(save.promise);
    const writing = f.settings.setSoundVolume(20);
    expect(f.changes.at(-1)).toMatchObject({ status: 'saving', soundVolume: 20 });
    await f.settings.setSoundVolume(90);
    expect(f.storage.write).toHaveBeenCalledOnce();
    save.reject(new Error('disk full'));
    await writing;
    expect(f.changes.at(-1)).toMatchObject({ soundVolume: 20, saved: false });
    await f.settings.retrySave();
    expect(f.storage.write.mock.calls[1]).toEqual(f.storage.write.mock.calls[0]);
    expect(f.changes.at(-1)).toMatchObject({ soundVolume: 20, saved: true });
  });
  it('keeps sound edits session-only after a failed read', async () => {
    const f = fixture();
    f.storage.read.mockRejectedValueOnce(new Error('denied'));
    await f.settings.load();
    await f.settings.setSoundVolume(90);
    await f.settings.setDeleteSoundEnabled(false);
    await f.settings.setToolbarStyle('bare');
    await f.settings.retrySave();
    expect(f.changes.at(-1)).toMatchObject({
      soundVolume: 90,
      deleteSoundEnabled: false,
      toolbarStyle: 'bare',
      soundEnabled: false,
      saved: false,
    });
    expect(f.storage.write).not.toHaveBeenCalled();
  });
});
