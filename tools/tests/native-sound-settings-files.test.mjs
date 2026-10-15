import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSoundSettings } from '../../experiments/native-architecture/src/settings/soundSettings.ts';
const memory = vi.hoisted(() => ({
  files: new Map(),
  moveGate: null,
  writeFailure: false,
  corruptWrite: false,
  pruneFailure: false,
}));
vi.mock('expo-file-system', () => {
  class Directory {
    constructor(parent, name) {
      this.path = `${parent}/${name}`;
    }
    create() {}
    list() {
      return [...memory.files.keys()]
        .filter((path) => path.startsWith(`${this.path}/`))
        .map((path) => new File(this, path.split('/').at(-1)));
    }
  }
  class File {
    constructor(parent, name) {
      this.path = `${parent.path}/${name}`;
    }
    get name() {
      return this.path.split('/').at(-1);
    }
    get exists() {
      return memory.files.has(this.path);
    }
    get size() {
      return memory.files.get(this.path)?.length ?? 0;
    }
    create() {
      if (this.exists) throw new Error('exists');
      memory.files.set(this.path, '');
    }
    write(snapshot) {
      if (memory.writeFailure) throw new Error('disk full');
      memory.files.set(this.path, memory.corruptWrite ? 'partial' : snapshot);
    }
    async text() {
      return this.textSync();
    }
    textSync() {
      if (!this.exists) throw new Error('missing file');
      return memory.files.get(this.path);
    }
    async move(destination) {
      if (memory.moveGate) await memory.moveGate.promise;
      if (destination.exists) throw new Error('destination exists');
      const snapshot = memory.files.get(this.path);
      memory.files.delete(this.path);
      memory.files.set(destination.path, snapshot);
      this.path = destination.path;
    }
    delete() {
      if (memory.pruneFailure && this.name.endsWith('.json')) throw new Error('permission denied');
      memory.files.delete(this.path);
    }
  }
  return { Directory, File, Paths: { document: 'documents' } };
});
import { soundSettingsStorage } from '../../experiments/native-architecture/src/platform/soundSettings.ts';
import { bootAppearance } from '../../experiments/native-architecture/src/platform/bootAppearance.ts';
const on = '{"version":1,"soundEnabled":true}';
const off = '{"version":1,"soundEnabled":false}';
function pending() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
beforeEach(() => {
  memory.files.clear();
  memory.moveGate = null;
  memory.writeFailure = false;
  memory.corruptWrite = false;
  memory.pruneFailure = false;
});

describe('native committed sound settings journal', () => {
  it.each(['light', 'dark'])(
    'paints the saved %s choice before asynchronous settings hydration',
    async (appearance) => {
      const owner = createSoundSettings(soundSettingsStorage, () => {});
      await owner.load();
      await owner.setAppearance(appearance);
      expect(bootAppearance()).toBe(appearance);
      memory.files.set('documents/splotch-sound-settings-v1/sound-2.pending', '{incomplete');
      expect(bootAppearance()).toBe(appearance);
      owner.dispose();
    }
  );

  it('uses System for unreadable settings without discarding the stored record', () => {
    const path = 'documents/splotch-sound-settings-v1/sound-1.json';
    memory.files.set(path, '{incomplete');
    expect(bootAppearance()).toBe('system');
    expect(memory.files.get(path)).toBe('{incomplete');
  });
  it('waits for the new move before reporting success and retains the previous snapshot', async () => {
    await soundSettingsStorage.write(on);
    memory.moveGate = pending();
    const saved = vi.fn();
    const writing = soundSettingsStorage.write(off).then(saved);
    await Promise.resolve();
    await Promise.resolve();
    expect(await soundSettingsStorage.read()).toBe(on);
    expect(saved).not.toHaveBeenCalled();
    memory.moveGate.resolve();
    await writing;
    expect(await soundSettingsStorage.read()).toBe(off);
    expect(saved).toHaveBeenCalledOnce();
    expect([...memory.files.values()]).toEqual([on, off]);
  });
  it.each(['writeFailure', 'corruptWrite'])(
    'preserves the committed choice after %s and retries cleanly',
    async (failure) => {
      await soundSettingsStorage.write(off);
      memory[failure] = true;
      await expect(soundSettingsStorage.write(on)).rejects.toThrow();
      expect(await soundSettingsStorage.read()).toBe(off);
      memory[failure] = false;
      await soundSettingsStorage.write(on);
      expect(await soundSettingsStorage.read()).toBe(on);
    }
  );
  it('keeps at most the current and immediately prior committed revision after verified writes', async () => {
    await soundSettingsStorage.write(on);
    await soundSettingsStorage.write(off);
    await soundSettingsStorage.write(on);
    expect([...memory.files.keys()]).toEqual(
      expect.arrayContaining([
        'documents/splotch-sound-settings-v1/sound-2.json',
        'documents/splotch-sound-settings-v1/sound-3.json',
      ])
    );
    expect(memory.files.size).toBe(2);
    expect(await soundSettingsStorage.read()).toBe(on);
  });
  it('keeps the verified newest choice if an older inert revision cannot be pruned', async () => {
    await soundSettingsStorage.write(on);
    await soundSettingsStorage.write(off);
    memory.pruneFailure = true;
    await expect(soundSettingsStorage.write(on)).resolves.toBeUndefined();
    expect(memory.files.size).toBe(3);
    expect(await soundSettingsStorage.read()).toBe(on);
  });
  it('ignores interrupted pending writes but fails muted if the latest committed format is corrupt', async () => {
    await soundSettingsStorage.write(off);
    memory.files.set('documents/splotch-sound-settings-v1/sound-2.pending', on);
    expect(await soundSettingsStorage.read()).toBe(off);
    memory.files.set(
      'documents/splotch-sound-settings-v1/sound-2.json',
      '{"version":1,"soundEnabled":"true"}'
    );
    const changes = [];
    const owner = createSoundSettings(soundSettingsStorage, (state) => changes.push(state));
    await owner.load();
    expect(changes.at(-1)).toMatchObject({ status: 'ready', soundEnabled: false, saved: false });
    await owner.setEnabled(true);
    expect(changes.at(-1)).toMatchObject({ soundEnabled: true, saved: false });
    await owner.retrySave();
    await owner.retryRead();
    expect(changes.at(-1)).toMatchObject({ saved: false });
    expect(memory.files.get('documents/splotch-sound-settings-v1/sound-2.json')).toBe(
      '{"version":1,"soundEnabled":"true"}'
    );
    memory.files.set('documents/splotch-sound-settings-v1/sound-2.json', off);
    await owner.retryRead();
    expect(changes.at(-1)).toMatchObject({ soundEnabled: false, saved: true });
    await owner.setEnabled(true);
    expect(changes.at(-1)).toMatchObject({ soundEnabled: true, saved: true });
    expect(await soundSettingsStorage.read()).toBe(
      '{"version":16,"soundEnabled":true,"strokeWidth":"medium","eraserWidth":"medium","appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","externalLinks":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons","toolDrawerEnabled":true,"screenshotEnabled":true,"aiCustomizationEnabled":true,"autoSaveAiEnabled":false}'
    );
  });
});
