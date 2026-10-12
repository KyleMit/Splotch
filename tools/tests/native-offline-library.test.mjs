import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename, stat } from 'node:fs/promises';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  catalogPack,
  parsePack,
  approvedAssetUrl,
} from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import {
  offlinePageId,
  isOfflinePageId,
} from '../../experiments/native-architecture/src/offlineLibrary/identity.ts';
import {
  createLibraryStore,
  packDirectory,
} from '../../experiments/native-architecture/src/offlineLibrary/store.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { LibraryFault } from '../../experiments/native-architecture/src/offlineLibrary/contract.ts';
import {
  emptyDrawing,
  parseDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  savePicture,
  reopenPicture,
  savedColoringPageIds,
} from '../../experiments/native-architecture/src/platform/drawingFiles.ts';

function createEnabledOfflineLibrary(...args) {
  const owner = createOfflineLibrary(...args);
  owner.setFeatureEnabled(true);
  return owner;
}

async function readyLibrary(owner = createEnabledOfflineLibrary(scratch.platform, 'full')) {
  await owner.initialize();
  return owner;
}

const savedConsumer = vi.hoisted(() => ({ root: '', owner: null }));
vi.mock('../../experiments/native-architecture/src/offlineLibrary/runtime.ts', () => ({
  offlineLibrary: {
    withSavedArtwork: (...args) => savedConsumer.owner.withSavedArtwork(...args),
    openPage: (...args) => savedConsumer.owner.openPage(...args),
  },
}));
vi.mock('expo-file-system', () => {
  const pathOf = (value) =>
    typeof value === 'string' ? value.replace(/^file:\/\//, '') : value.path;
  class Directory {
    constructor(parent, ...parts) {
      this.path = join(pathOf(parent), ...parts);
    }
    create() {
      fs.mkdirSync(this.path, { recursive: true });
    }
    list() {
      return fs.readdirSync(this.path).map((name) => new File(this, name));
    }
  }
  class File {
    constructor(parent, ...parts) {
      this.path = join(pathOf(parent), ...parts);
    }
    get uri() {
      return `file://${this.path}`;
    }
    get name() {
      return this.path.split('/').at(-1);
    }
    get exists() {
      return fs.existsSync(this.path);
    }
    get size() {
      return fs.statSync(this.path).size;
    }
    create() {
      fs.writeFileSync(this.path, '');
    }
    write(value) {
      fs.writeFileSync(this.path, value);
    }
    async text() {
      return fs.readFileSync(this.path, 'utf8');
    }
    move(destination) {
      fs.renameSync(this.path, destination.path);
      this.path = destination.path;
    }
    delete() {
      fs.unlinkSync(this.path);
    }
  }
  return {
    Directory,
    File,
    Paths: {
      get document() {
        return savedConsumer.root;
      },
    },
  };
});

const staticRoot = new URL('../../web/static/', import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
let scratch;
const roots = [];
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function diskPlatform() {
  const root = await mkdtemp(join(tmpdir(), 'splotch-library-unit-'));
  roots.push(root);
  const state = {
    online: true,
    metered: false,
    freeBytes: 1e9,
    downloads: 0,
    corrupt: false,
    gate: null,
    entered: null,
    failWrite: false,
  };
  const file = (path) => join(root, path);
  const platform = {
    async environment() {
      return { online: state.online, metered: state.metered, freeBytes: state.freeBytes };
    },
    async list() {
      return (await readdir(root, { withFileTypes: true }))
        .filter((item) => item.isDirectory())
        .map((item) => item.name);
    },
    async read(path, limit) {
      try {
        const bytes = await readFile(file(path));
        if (bytes.length > limit) throw new Error('Too large');
        return bytes;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    async write(path, bytes) {
      if (state.failWrite) throw new Error('ENOSPC');
      await mkdir(dirname(file(path)), { recursive: true });
      await writeFile(file(path), bytes);
    },
    async remove(path) {
      await rm(file(path), { recursive: true, force: true });
    },
    async move(from, to) {
      await mkdir(dirname(file(to)), { recursive: true });
      await rename(file(from), file(to));
    },
    uri(path) {
      return `file://${file(path)}`;
    },
    async verify(path, expected) {
      try {
        const bytes = await readFile(file(path));
        return bytes.length === expected.bytes && digest(bytes) === expected.sha256;
      } catch {
        return false;
      }
    },
    async download(path, expected, _signal, _allowMetered, progress) {
      state.downloads++;
      state.entered?.resolve();
      if (state.gate) await state.gate.promise;
      const bytes = await readFile(new URL(expected.downloadPath.slice(1), staticRoot));
      if (state.corrupt) bytes[0] ^= 1;
      await platform.write(path, bytes);
      progress(bytes.length);
    },
    dispose() {},
  };
  return { platform, state, root };
}
beforeEach(async () => {
  scratch = await diskPlatform();
  savedConsumer.root = scratch.root;
});
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const dinosaur = catalogPack('dinosaur', 'full');

describe('approved offline coloring catalog', () => {
  it('pins all six Dinosaurs pages and every required orientation/theme/selector asset', () => {
    expect(dinosaur.files).toHaveLength(74);
    expect(dinosaur.files.reduce((bytes, file) => bytes + file.bytes, 0)).toBe(dinosaur.bytes);
    expect(digest(JSON.stringify(dinosaur.files))).toBe(dinosaur.revision);
    for (const file of dinosaur.files)
      expect(approvedAssetUrl(file.downloadPath)).toBe(`https://splotch.art${file.downloadPath}`);
  });
  it.each([
    'https://evil.test/a.svg',
    '//evil.test/a.svg',
    '/coloring/dinosaur/../farm/cat.webp',
    '/coloring/dinosaur/%2e%2e/cat.webp',
    '/coloring/dinosaur/cat.webp?x=1',
    '/coloring/dinosaur/cat.webp#x',
  ])('rejects unsafe path %s', (path) => {
    expect(() => approvedAssetUrl(path)).toThrow();
  });
  it('rejects duplicates, missing files, oversized files, forged totals and wrong compact mappings', () => {
    const variants = [
      { ...dinosaur, files: dinosaur.files.slice(1) },
      { ...dinosaur, files: [dinosaur.files[1], ...dinosaur.files.slice(1)] },
      { ...dinosaur, bytes: dinosaur.bytes + 1 },
      { ...dinosaur, files: [{ ...dinosaur.files[0], bytes: 3e6 }, ...dinosaur.files.slice(1)] },
      {
        ...dinosaur,
        files: [
          { ...dinosaur.files[0], downloadPath: '/coloring/vehicles/cover.thumb.webp' },
          ...dinosaur.files.slice(1),
        ],
      },
    ];
    for (const value of variants) expect(() => parsePack(value)).toThrow();
  });
});

describe('real disk pack publication and saved picture consumers', () => {
  it('installs exactly 74 verified files, saves the revision, removes the book, relaunches offline and reopens identical artwork', async () => {
    const store = createLibraryStore(scratch.platform);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    expect((await store.scan()).map((pack) => pack.id)).toEqual(['dinosaur']);
    expect(scratch.state.downloads).toBe(74);
    const id = offlinePageId(dinosaur, 'trex');
    expect(isOfflinePageId(id)).toBe(true);
    savedConsumer.owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    const drawing = parseDrawing({
      ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }, 0, id),
      strokes: [
        { ...strokeStyle('magic', 'Purple', emptyDrawing(0, id)), points: [{ x: 100, y: 200 }] },
      ],
    });
    const picture = await savePicture(drawing);
    expect(await savedColoringPageIds()).toEqual([id]);
    const artBefore = await store.openPage(id);
    await savedConsumer.owner.remove(savedColoringPageIds);
    expect(await store.scan()).toEqual([]);
    expect(await stat(join(scratch.root, packDirectory(dinosaur), 'retained.json'))).toBeDefined();
    scratch.state.online = false;
    const relaunched = createEnabledOfflineLibrary(scratch.platform, 'full');
    savedConsumer.owner = relaunched;
    await readyLibrary(relaunched);
    expect(relaunched.snapshot().retainedBytes).toBe(dinosaur.bytes);
    const reopened = await reopenPicture(picture.id);
    expect(reopened).toEqual(drawing);
    expect(relaunched.snapshot().artwork[id]).toEqual(artBefore);
    expect(relaunched.snapshot().artwork[id].light.outline).toContain('<svg');
    expect(relaunched.snapshot().artwork[id].dark.fill).toContain('trex-wide.night.webp');
    expect(scratch.state.downloads).toBe(74);
  });
  it('never shows an interrupted partial pack and discards its staging directory on fresh launch', async () => {
    const store = createLibraryStore(scratch.platform);
    scratch.state.gate = deferred();
    scratch.state.entered = deferred();
    const abort = new AbortController();
    const installing = store.install(dinosaur, abort.signal, false, () => {});
    await scratch.state.entered.promise;
    const files = await readdir(scratch.root);
    expect(files.some((name) => name.startsWith('staging-'))).toBe(false);
    abort.abort();
    scratch.state.gate.resolve();
    await expect(installing).rejects.toMatchObject({ code: 'cancelled' });
    expect(await store.scan()).toEqual([]);
    await mkdir(join(scratch.root, 'staging-abandoned'), { recursive: true });
    await writeFile(
      join(scratch.root, 'staging-abandoned', 'installed.json'),
      JSON.stringify(dinosaur)
    );
    expect(await createLibraryStore(scratch.platform).scan()).toEqual([]);
    expect(fs.existsSync(join(scratch.root, 'staging-abandoned'))).toBe(false);
  });
  it('discards files moved before an interrupted marker publication on fresh launch', async () => {
    const directory = join(scratch.root, packDirectory(dinosaur));
    await mkdir(join(directory, 'files'), { recursive: true });
    await writeFile(join(directory, 'files', 'trex-wide.light.webp'), 'partial');
    await writeFile(join(directory, 'pending.json'), JSON.stringify(dinosaur));
    expect(await createLibraryStore(scratch.platform).scan()).toEqual([]);
    expect(fs.existsSync(directory)).toBe(false);
  });
  it('preserves complete packs when an actual saved JSON cannot be parsed for removal', async () => {
    const store = createLibraryStore(scratch.platform);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    savedConsumer.owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    await mkdir(join(scratch.root, 'splotch-pictures'), { recursive: true });
    await writeFile(join(scratch.root, 'splotch-pictures', 'picture-123-broken.json'), '{');
    await savedConsumer.owner.remove(savedColoringPageIds);
    expect(savedConsumer.owner.snapshot()).toMatchObject({
      fault: 'corrupt',
      message: 'A saved picture could not be checked. Your coloring books were kept.',
    });
    expect((await store.scan()).map((pack) => pack.id)).toEqual(['dinosaur']);
  });
  it('rejects corrupt bytes before publication and refuses damaged retained art on reopen', async () => {
    const store = createLibraryStore(scratch.platform);
    scratch.state.corrupt = true;
    await expect(
      store.install(dinosaur, new AbortController().signal, false, () => {})
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(await store.scan()).toEqual([]);
    scratch.state.corrupt = false;
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    const id = offlinePageId(dinosaur, 'trex');
    await store.remove(async () => [id]);
    await writeFile(
      join(scratch.root, packDirectory(dinosaur), 'files', 'trex-wide.light.webp'),
      'damaged'
    );
    await expect(store.openPage(id)).rejects.toMatchObject({ code: 'corrupt' });
  });
  it('serializes a save commit before removal calculates protected revisions', async () => {
    const store = createLibraryStore(scratch.platform);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    const id = offlinePageId(dinosaur, 'trex');
    const gate = deferred();
    const entered = deferred();
    let saved = [];
    const saving = store.withSavedArtwork(id, async () => {
      entered.resolve();
      await gate.promise;
      saved = [id];
    });
    await entered.promise;
    const removing = store.remove(async () => saved);
    gate.resolve();
    await saving;
    await removing;
    expect(await store.openPage(id)).toBeDefined();
    expect(await store.scan()).toEqual([]);
  });
  it('rejects damaged protected artwork before removing any other complete pack', async () => {
    const store = createLibraryStore(scratch.platform);
    const creatures = catalogPack('creatures', 'full');
    await store.install(creatures, new AbortController().signal, false, () => {});
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    await writeFile(join(scratch.root, packDirectory(dinosaur), 'identity.json'), 'corrupt');
    await expect(store.remove(async () => [offlinePageId(dinosaur, 'trex')])).rejects.toMatchObject(
      { code: 'corrupt' }
    );
    expect((await store.scan()).map((pack) => pack.id)).toEqual(['creatures']);
    expect(fs.existsSync(join(scratch.root, packDirectory(creatures), 'installed.json'))).toBe(
      true
    );
  });
  it('withdraws publication when cancellation arrives during the marker move', async () => {
    const store = createLibraryStore(scratch.platform);
    const abort = new AbortController();
    const move = scratch.platform.move;
    scratch.platform.move = async (from, to) => {
      await move(from, to);
      if (to.endsWith('/installed.json')) abort.abort();
    };
    await expect(store.install(dinosaur, abort.signal, false, () => {})).rejects.toMatchObject({
      code: 'cancelled',
    });
    expect(await store.scan()).toEqual([]);
  });
  it('stops before a second file when Wi-Fi becomes metered and never publishes the partial pack', async () => {
    const download = scratch.platform.download;
    scratch.platform.download = async (...args) => {
      await download(...args);
      scratch.state.metered = true;
    };
    const store = createLibraryStore(scratch.platform);
    await expect(
      store.install(dinosaur, new AbortController().signal, false, () => {})
    ).rejects.toMatchObject({ code: 'metered' });
    expect(scratch.state.downloads).toBe(1);
    expect(await store.scan()).toEqual([]);
  });
  it('allows a metered download only after the saved parent policy opts in', async () => {
    scratch.state.metered = true;
    const owner = await readyLibrary();
    await owner.setPolicy(true, true);
    owner.engage();
    await owner.settled();
    expect(owner.snapshot().installed).toHaveLength(7);
    expect(scratch.state.downloads).toBe(518);
  });
  it('keeps the original saved JSON unchanged when artwork cannot be reopened', async () => {
    const id = offlinePageId(dinosaur, 'trex');
    savedConsumer.owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    await expect(savePicture(emptyDrawing(0, id))).rejects.toMatchObject({ code: 'corrupt' });
    expect((await readdir(scratch.root)).filter((name) => name.includes('picture'))).toEqual([]);
  });
});

describe('download controller dispositions', () => {
  it('extends the complete catalog sequentially with seven real complete packs', async () => {
    const owner = await readyLibrary();
    owner.engage();
    await owner.settled();
    expect(owner.snapshot().installed.map((pack) => pack.id)).toEqual([
      'dinosaur',
      'creatures',
      'nature',
      'objects',
      'shapes',
      'space',
      'vehicles',
    ]);
    expect(scratch.state.downloads).toBe(7 * 74);
    expect(await createLibraryStore(scratch.platform).scan()).toHaveLength(7);
    expect(owner.snapshot().fault).toBeNull();
  });
  it('pauses on background and rejects a late native completion', async () => {
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    scratch.state.entered = deferred();
    scratch.state.gate = deferred();
    await readyLibrary(owner);
    owner.engage();
    await scratch.state.entered.promise;
    owner.setActive(false);
    scratch.state.gate.resolve();
    await owner.settled();
    expect(owner.snapshot().installed).toEqual([]);
    expect(owner.snapshot().message).toContain('background');
    expect(await createLibraryStore(scratch.platform).scan()).toEqual([]);
  });
  it('serializes rapid parent policy changes and restores the final policy on relaunch', async () => {
    const owner = await readyLibrary();
    await Promise.all([
      owner.setPolicy(false, true),
      owner.setPolicy(true, false),
      owner.setPolicy(false, false),
    ]);
    const fresh = await readyLibrary();
    expect(fresh.snapshot()).toMatchObject({ enabled: false, allowMetered: false });
  });

  it.each([
    ['offline', false, false],
    ['metered', true, true],
  ])('waits on %s without starting a transfer', async (fault, online, metered) => {
    scratch.state.online = online;
    scratch.state.metered = metered;
    const owner = await readyLibrary();
    owner.engage();
    await owner.settled();
    expect(owner.snapshot().fault).toBe(fault);
    expect(scratch.state.downloads).toBe(0);
  });
  it('reports storage full before a transfer and retries after space is available', async () => {
    scratch.state.freeBytes = 1;
    const owner = await readyLibrary();
    owner.engage();
    await owner.settled();
    expect(owner.snapshot().fault).toBe('storage-full');
    expect(scratch.state.downloads).toBe(0);
    scratch.state.freeBytes = 1e9;
    scratch.state.entered = deferred();
    scratch.state.gate = deferred();
    owner.retry();
    await scratch.state.entered.promise;
    owner.cancel();
    scratch.state.gate.resolve();
    await owner.settled();
    expect(owner.snapshot().installed).toEqual([]);
    expect(owner.snapshot().status).toBe('ready');
  });
  it('rejects stale success and progress after cancel, then removes without publication', async () => {
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    scratch.state.entered = deferred();
    scratch.state.gate = deferred();
    await readyLibrary(owner);
    owner.engage();
    await scratch.state.entered.promise;
    owner.cancel();
    const message = owner.snapshot().message;
    scratch.state.gate.resolve();
    await owner.settled();
    expect(owner.snapshot().installed).toEqual([]);
    expect(owner.snapshot().message).toBe(message);
    await owner.remove(async () => []);
    expect(await createLibraryStore(scratch.platform).scan()).toEqual([]);
  });
  it('does not start downloads until engagement or while disabled', async () => {
    const owner = await readyLibrary();
    expect(scratch.state.downloads).toBe(0);
    await owner.setPolicy(false, true);
    owner.engage();
    await owner.settled();
    expect(scratch.state.downloads).toBe(0);
  });
  it('retains unavailable as a distinct storage outcome', async () => {
    scratch.platform.environment = async () => {
      throw new LibraryFault('unavailable', 'Not in this app build.');
    };
    const owner = await readyLibrary();
    expect(owner.snapshot().fault).toBe('unavailable');
  });
});
