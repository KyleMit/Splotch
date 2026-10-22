import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { canonicalPaper } from './native-paper-fixtures.mjs';
import {
  addStroke,
  changePage,
  createHistory,
  strokeStyle,
  undoDrawing,
} from '../../src/drawing/model.ts';
import { join, dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogPack } from '../../src/offlineLibrary/catalog.ts';
import { offlinePageId } from '../../src/offlineLibrary/identity.ts';
import { createLibraryStore, packDirectory } from '../../src/offlineLibrary/store.ts';
import { createOfflineLibrary } from '../../src/offlineLibrary/controller.ts';
import { LIBRARY_STORAGE_RESERVE_BYTES } from '../../src/offlineLibrary/contract.ts';

function createEnabledOfflineLibrary(...args) {
  const owner = createOfflineLibrary(...args);
  owner.setFeatureEnabled(true);
  return owner;
}

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
});
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const dinosaur = catalogPack('dinosaur', 'full');

describe('R1 real controller and disk regression controls', () => {
  it.each([
    ['active', true],
    ['master-off', false],
    ['disposed', false],
  ])('handles native completion during a page open with %s', async (disposition, published) => {
    const base = scratch.platform;
    await createLibraryStore(base).install(dinosaur, new AbortController().signal, false, () => {});
    const verifying = deferred();
    const finish = deferred();
    const transferStore = createLibraryStore(base);
    let holdVerification = false;
    const platform = {
      ...base,
      async verify(path, expected) {
        if (holdVerification && path.startsWith('creatures-')) {
          holdVerification = false;
          verifying.resolve();
          await finish.promise;
        }
        return base.verify(path, expected);
      },
      async installPack(...args) {
        await transferStore.install(...args);
        if (args[0].id === 'creatures') holdVerification = true;
      },
      cancelInstallations: async () => {},
    };
    const owner = createEnabledOfflineLibrary(platform, 'full');
    try {
      await owner.initialize();
      expect(owner.snapshot().installed.map((pack) => pack.id)).toEqual(['dinosaur']);
      owner.engage();
      await verifying.promise;
      const opening = owner.openPage(offlinePageId(dinosaur, 'trex'));
      if (disposition === 'master-off') owner.setFeatureEnabled(false);
      if (disposition === 'disposed') owner.dispose();
      finish.resolve();
      await opening;
      await owner.settled();
      expect(owner.snapshot().installed.some((pack) => pack.id === 'creatures')).toBe(published);
      expect(owner.snapshot().activeBook).not.toBe('creatures');
    } finally {
      finish.resolve();
      owner.dispose();
      await owner.settled();
    }
  });
  it('prunes obsolete staging during inventory and preserves current verified partial bytes', async () => {
    const compact = catalogPack('dinosaur', 'compact');
    const store = createLibraryStore(scratch.platform);
    const download = scratch.platform.download;
    for (const pack of [compact, dinosaur]) {
      const abort = new AbortController();
      scratch.platform.download = async (...args) => {
        await download(...args);
        abort.abort();
      };
      await expect(store.install(pack, abort.signal, false, () => {})).rejects.toMatchObject({
        code: 'cancelled',
      });
    }
    scratch.platform.download = download;
    const obsoleteStage = join(scratch.root, `staging-${packDirectory(compact)}`);
    const currentStage = join(scratch.root, `staging-${packDirectory(dinosaur)}`);
    const currentFile = join(currentStage, 'files', dinosaur.files[0].path.split('/').at(-1));
    const before = await readFile(currentFile);
    expect(fs.existsSync(obsoleteStage)).toBe(true);
    await createLibraryStore(scratch.platform).inventory([dinosaur]);
    expect(fs.existsSync(obsoleteStage)).toBe(false);
    expect(await readFile(currentFile)).toEqual(before);
    expect(scratch.state.downloads).toBe(2);
  });
  it.each([false, true])(
    'resumes verified staging after cancellation and rechecks tampered bytes: %s',
    async (tamper) => {
      const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
      const counts = new Map();
      const download = scratch.platform.download;
      scratch.platform.download = async (...args) => {
        counts.set(args[1].downloadPath, (counts.get(args[1].downloadPath) ?? 0) + 1);
        await download(...args);
        if (scratch.state.downloads === 60) owner.cancel();
      };
      await owner.initialize();
      owner.engage();
      await owner.settled();
      expect(scratch.state.downloads).toBe(60);
      expect(owner.snapshot().installed).toEqual([]);
      const staging = join(scratch.root, `staging-${packDirectory(dinosaur)}`);
      expect(fs.existsSync(staging)).toBe(true);
      const first = dinosaur.files[0];
      if (tamper) await writeFile(join(staging, 'files', first.path.split('/').at(-1)), 'corrupt');
      owner.retry();
      await owner.settled();
      expect(owner.snapshot().installed).toHaveLength(7);
      expect(scratch.state.downloads).toBe(518 + Number(tamper));
      expect(counts.get(first.downloadPath)).toBe(tamper ? 2 : 1);
      expect(
        [...counts].filter(([path]) => path !== first.downloadPath).map(([, count]) => count)
      ).toEqual(Array(counts.size - 1).fill(1));
      expect(fs.existsSync(staging)).toBe(false);
    }
  );

  it('resumes with enough free space for only the remaining verified pack bytes', async () => {
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    const download = scratch.platform.download;
    scratch.platform.download = async (...args) => {
      await download(...args);
      if (scratch.state.downloads === 60) owner.cancel();
    };
    await owner.initialize();
    owner.engage();
    await owner.settled();
    scratch.state.freeBytes =
      LIBRARY_STORAGE_RESERVE_BYTES +
      dinosaur.bytes -
      dinosaur.files.slice(0, 60).reduce((bytes, file) => bytes + file.bytes, 0);
    owner.retry();
    await owner.settled();
    expect(owner.snapshot().installed.some((pack) => pack.revision === dinosaur.revision)).toBe(
      true
    );
  });

  it('resumes interrupted verified staging on a fresh controller without redownloading valid files', async () => {
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    const download = scratch.platform.download;
    scratch.platform.download = async (...args) => {
      await download(...args);
      if (scratch.state.downloads === 60) owner.cancel();
    };
    await owner.initialize();
    owner.engage();
    await owner.settled();
    owner.dispose();
    const fresh = createEnabledOfflineLibrary(scratch.platform, 'full');
    await fresh.initialize();
    expect((await readdir(scratch.root)).some((name) => name.startsWith('staging-'))).toBe(true);
    fresh.engage();
    await fresh.settled();
    expect(fresh.snapshot().installed).toHaveLength(7);
    expect(scratch.state.downloads).toBe(518);
  });

  it('resolves real superseded artwork after same-session Magic page Undo and removes pinned files explicitly', async () => {
    const store = createLibraryStore(scratch.platform);
    const compact = catalogPack('dinosaur', 'compact');
    await store.install(compact, new AbortController().signal, false, () => {});
    const oldId = offlinePageId(compact, 'trex');
    const oldArt = await store.openPage(oldId);
    let history = changePage(createHistory(), oldId);
    history = addStroke(
      history,
      { ...strokeStyle('magic', 'Blue', history.drawing), points: [{ x: 512, y: 384 }] },
      canonicalPaper()
    );
    const original = history.drawing;
    expect(await store.inventory([dinosaur])).toEqual([]);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    const replacementId = offlinePageId(dinosaur, 'stegosaurus');
    await store.openPage(replacementId);
    history = changePage(history, replacementId);
    expect(history.drawing.strokes).toBe(original.strokes);
    expect((await store.inventory([dinosaur])).map((pack) => pack.revision)).toEqual([
      dinosaur.revision,
    ]);
    history = undoDrawing(history);
    expect(history.drawing).toBe(original);
    const restored = await store.openPage(history.drawing.pageId);
    expect(restored).toEqual(oldArt);
    const bytes = await readFile(fileURLToPath(restored.portrait.dark.fill));
    const expected = compact.files.find((file) => file.path.endsWith('/trex-tall.night.webp'));
    expect(bytes.length).toBe(expected.bytes);
    expect(digest(bytes)).toBe(expected.sha256);
    await store.remove();
    expect(fs.existsSync(join(scratch.root, packDirectory(compact)))).toBe(false);
    expect(fs.existsSync(join(scratch.root, packDirectory(dinosaur)))).toBe(false);
    await expect(store.openPage(oldId)).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('prunes superseded opened revisions on fresh inventory and keeps the current complete tier offline', async () => {
    const compact = catalogPack('dinosaur', 'compact');
    const store = createLibraryStore(scratch.platform);
    await store.install(compact, new AbortController().signal, false, () => {});
    const oldId = offlinePageId(compact, 'trex');
    await store.openPage(oldId);
    await store.install(dinosaur, new AbortController().signal, false, () => {});
    expect(fs.existsSync(join(scratch.root, packDirectory(compact)))).toBe(true);
    const fresh = createEnabledOfflineLibrary(scratch.platform, 'full');
    scratch.state.online = false;
    await fresh.initialize();
    fresh.engage();
    await fresh.settled();
    expect(fresh.snapshot().installed).toEqual([dinosaur]);
    expect(fs.existsSync(join(scratch.root, packDirectory(compact)))).toBe(false);
    await expect(fresh.openPage(oldId)).rejects.toMatchObject({ code: 'corrupt' });
    const currentId = offlinePageId(dinosaur, 'trex');
    await fresh.openPage(currentId);
    expect(fresh.snapshot().artwork[currentId]).toBeDefined();
    expect(scratch.state.downloads).toBe(148);
    await fresh.remove();
    expect(fresh.snapshot().installed).toEqual([]);
    expect(fs.existsSync(join(scratch.root, packDirectory(dinosaur)))).toBe(false);
  });
});
