import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogPack, parsePack, approvedAssetUrl } from '../../src/offlineLibrary/catalog.ts';
import { offlinePageId, isOfflinePageId } from '../../src/offlineLibrary/identity.ts';
import { createLibraryStore, packDirectory } from '../../src/offlineLibrary/store.ts';
import { createOfflineLibrary } from '../../src/offlineLibrary/controller.ts';
import { createLibrary } from '../../src/offlineLibrary/createLibrary.ts';
import { LibraryFault } from '../../src/offlineLibrary/contract.ts';

function createEnabledOfflineLibrary(...args) {
  const owner = createOfflineLibrary(...args);
  owner.setFeatureEnabled(true);
  return owner;
}

async function readyLibrary(owner = createEnabledOfflineLibrary(scratch.platform, 'full')) {
  await owner.initialize();
  return owner;
}

const nativeFactory = vi.hoisted(() => ({ platform: null, screen: null }));
vi.mock('../../src/platform/offlineLibrary.ts', () => ({
  createLibraryPlatform: () => nativeFactory.platform,
}));
vi.mock('react-native', () => ({ Dimensions: { get: () => nativeFactory.screen } }));
const staticRoot = new URL('../../assets/static/', import.meta.url);
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
  nativeFactory.platform = scratch.platform;
  nativeFactory.screen = { width: 390, height: 844, scale: 2 };
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

describe('real disk pack publication and removal', () => {
  it('installs 74 verified files and removes their revision before an offline relaunch', async () => {
    const store = createLibraryStore(scratch.platform);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    expect((await store.scan()).map((pack) => pack.id)).toEqual(['dinosaur']);
    expect(scratch.state.downloads).toBe(74);
    const id = offlinePageId(dinosaur, 'trex');
    expect(isOfflinePageId(id)).toBe(true);
    const artwork = await store.openPage(id);
    expect(artwork.portrait.dark.fill).toContain('trex-tall.night.webp');
    expect(artwork.landscape.dark.fill).toContain('trex-wide.night.webp');
    const owner = await readyLibrary();
    await owner.remove();
    expect(await store.scan()).toEqual([]);
    expect(fs.existsSync(join(scratch.root, packDirectory(dinosaur)))).toBe(false);
    scratch.state.online = false;
    const relaunched = await readyLibrary();
    expect(relaunched.snapshot()).toMatchObject({ installed: [] });
    await expect(relaunched.openPage(id)).rejects.toMatchObject({ code: 'corrupt' });
    expect(scratch.state.downloads).toBe(74);
  });
  it('keeps an interrupted pack hidden, resumes verified staging and removes abandoned storage', async () => {
    const store = createLibraryStore(scratch.platform);
    scratch.state.gate = deferred();
    scratch.state.entered = deferred();
    const abort = new AbortController();
    const installing = store.install(dinosaur, abort.signal, false, () => {});
    await scratch.state.entered.promise;
    const files = await readdir(scratch.root);
    expect(files.some((name) => name.startsWith('staging-'))).toBe(true);
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
    expect(
      fs.existsSync(join(scratch.root, `staging-${packDirectory(dinosaur)}`, 'identity.json'))
    ).toBe(true);
    const downloaded = scratch.state.downloads;
    await createLibraryStore(scratch.platform).install(
      dinosaur,
      new AbortController().signal,
      false,
      () => {}
    );
    expect(scratch.state.downloads - downloaded).toBe(73);
    expect(await createLibraryStore(scratch.platform).scan()).toEqual([dinosaur]);
  });
  it('discards files moved before an interrupted marker publication on fresh launch', async () => {
    const directory = join(scratch.root, packDirectory(dinosaur));
    await mkdir(join(directory, 'files'), { recursive: true });
    await writeFile(join(directory, 'files', 'trex-wide.light.webp'), 'partial');
    await writeFile(join(directory, 'pending.json'), JSON.stringify(dinosaur));
    expect(await createLibraryStore(scratch.platform).scan()).toEqual([]);
    expect(fs.existsSync(directory)).toBe(false);
  });
  it('removes books without reading or deleting unrelated legacy picture records', async () => {
    const store = createLibraryStore(scratch.platform);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    const original = join(scratch.root, 'splotch-pictures', 'picture-123-broken.json');
    await mkdir(dirname(original), { recursive: true });
    await writeFile(original, '{');
    const read = scratch.platform.read;
    scratch.platform.read = vi.fn((...args) => read(...args));
    const owner = await readyLibrary();
    await owner.remove();
    expect(owner.snapshot()).toMatchObject({ status: 'ready', installed: [] });
    expect(await store.scan()).toEqual([]);
    expect(await readFile(original, 'utf8')).toBe('{');
    expect(
      scratch.platform.read.mock.calls.some(([path]) => path.startsWith('splotch-pictures/'))
    ).toBe(false);
  });
  it('rejects corrupt bytes before publication and refuses damaged installed art on reopen', async () => {
    const store = createLibraryStore(scratch.platform);
    scratch.state.corrupt = true;
    await expect(
      store.install(dinosaur, new AbortController().signal, false, () => {})
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(await store.scan()).toEqual([]);
    scratch.state.corrupt = false;
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    const id = offlinePageId(dinosaur, 'trex');
    await writeFile(
      join(scratch.root, packDirectory(dinosaur), 'files', 'trex-wide.light.webp'),
      'damaged'
    );
    await expect(store.openPage(id)).rejects.toMatchObject({ code: 'corrupt' });
  });
  it('finishes an active artwork read before removing its verified pack', async () => {
    const store = createLibraryStore(scratch.platform);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    const id = offlinePageId(dinosaur, 'trex');
    const gate = deferred();
    const entered = deferred();
    const verify = scratch.platform.verify;
    scratch.platform.verify = async (...args) => {
      entered.resolve();
      await gate.promise;
      return verify(...args);
    };
    const opening = store.openPage(id);
    await entered.promise;
    const removing = store.remove();
    gate.resolve();
    expect(await opening).toBeDefined();
    await removing;
    expect(await store.scan()).toEqual([]);
    await expect(store.openPage(id)).rejects.toMatchObject({ code: 'corrupt' });
  });
  it('removes damaged and complete revisions without retaining unusable artwork', async () => {
    const store = createLibraryStore(scratch.platform);
    const creatures = catalogPack('creatures', 'full');
    await store.install(creatures, new AbortController().signal, false, () => {});
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    await writeFile(join(scratch.root, packDirectory(dinosaur), 'identity.json'), 'corrupt');
    await store.remove();
    expect(await store.scan()).toEqual([]);
    expect(fs.existsSync(join(scratch.root, packDirectory(creatures)))).toBe(false);
    expect(fs.existsSync(join(scratch.root, packDirectory(dinosaur)))).toBe(false);
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
});

describe('the native launch library', () => {
  it.each([
    [{ width: 375, height: 812, scale: 2 }, 'compact'],
    [{ width: 390, height: 844, scale: 2 }, 'full'],
    [{ width: 390, height: 844, scale: 3 }, 'full'],
    [{ width: 768, height: 1024, scale: 2 }, 'full'],
    [{ width: 0, height: 0, scale: 1 }, 'full'],
  ])(
    'starts downloads at boot using the shipping screen tier for %j',
    async (screen, resolution) => {
      nativeFactory.screen = screen;
      const owner = createLibrary();
      owner.setFeatureEnabled(true);
      await owner.initialize();
      await owner.settled();
      expect(owner.snapshot().installed).toHaveLength(7);
      expect(owner.snapshot().installed[0]).toEqual(catalogPack('dinosaur', resolution));
      expect(scratch.state.downloads).toBe(7 * 74);
    }
  );
});

describe('download controller dispositions', () => {
  it.each(['offline', 'metered'])(
    'queues a whole native book on %s so the OS can resume it without JavaScript',
    async (connection) => {
      scratch.state.online = connection !== 'offline';
      scratch.state.metered = connection === 'metered';
      const installPack = vi.fn(() => new Promise(() => {}));
      const owner = createEnabledOfflineLibrary(
        { ...scratch.platform, installPack, cancelInstallations: async () => {} },
        'full'
      );
      try {
        await owner.initialize();
        owner.engage();
        await vi.waitFor(() => expect(installPack).toHaveBeenCalledOnce());
        expect(installPack.mock.calls[0][0]).toEqual(dinosaur);
        expect(installPack.mock.calls[0][2]).toBe(false);
        expect(scratch.state.downloads).toBe(0);
      } finally {
        owner.dispose();
      }
    }
  );

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
  it('lets a native book transfer finish and publish while drawing or in the background', async () => {
    const transferStore = createLibraryStore(scratch.platform);
    const installPack = vi.fn((...args) => transferStore.install(...args));
    const owner = createEnabledOfflineLibrary(
      { ...scratch.platform, installPack, cancelInstallations: async () => {} },
      'full'
    );
    scratch.state.entered = deferred();
    scratch.state.gate = deferred();
    await readyLibrary(owner);
    owner.engage();
    await scratch.state.entered.promise;
    owner.setDrawing(true);
    owner.setActive(false);
    scratch.state.gate.resolve();
    await owner.settled();
    expect(installPack).toHaveBeenCalledTimes(7);
    expect(owner.snapshot().installed).toHaveLength(7);
    expect(await createLibraryStore(scratch.platform).scan()).toHaveLength(7);
    expect(owner.snapshot().fault).toBeNull();
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
    await owner.remove();
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
