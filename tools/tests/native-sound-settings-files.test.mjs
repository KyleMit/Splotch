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
    expect(changes.at(-1)).toMatchObject({ soundEnabled: true, saved: true });
    expect(await soundSettingsStorage.read()).toBe(on);
  });
});
