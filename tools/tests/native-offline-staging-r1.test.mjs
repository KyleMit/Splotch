import { readSavedNativePicture } from './native-saved-picture-readback.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogPack } from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { offlinePageId } from '../../experiments/native-architecture/src/offlineLibrary/identity.ts';
import {
  createLibraryStore,
  packDirectory,
} from '../../experiments/native-architecture/src/offlineLibrary/store.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { LIBRARY_STORAGE_RESERVE_BYTES } from '../../experiments/native-architecture/src/offlineLibrary/contract.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  savePicture,
  savedColoringPageIds,
} from '../../experiments/native-architecture/src/platform/drawingFiles.ts';

function createEnabledOfflineLibrary(...args) {
  const owner = createOfflineLibrary(...args);
  owner.setFeatureEnabled(true);
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

describe('R1 real controller and disk regression controls', () => {
  it.each([false, true])(
    'resumes verified staging after drawing and rechecks tampered bytes: %s',
    async (tamper) => {
      const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
      const counts = new Map();
      const download = scratch.platform.download;
      scratch.platform.download = async (...args) => {
        counts.set(args[1].downloadPath, (counts.get(args[1].downloadPath) ?? 0) + 1);
        await download(...args);
        if (scratch.state.downloads === 60) owner.setDrawing(true);
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
      owner.setDrawing(false);
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
      if (scratch.state.downloads === 60) owner.setDrawing(true);
    };
    await owner.initialize();
    owner.engage();
    await owner.settled();
    scratch.state.freeBytes =
      LIBRARY_STORAGE_RESERVE_BYTES +
      dinosaur.bytes -
      dinosaur.files.slice(0, 60).reduce((bytes, file) => bytes + file.bytes, 0);
    owner.setDrawing(false);
    await owner.settled();
    expect(owner.snapshot().installed.some((pack) => pack.revision === dinosaur.revision)).toBe(
      true
    );
  });

  it('discards interrupted verified staging on a fresh controller launch without claiming restored jobs', async () => {
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    const download = scratch.platform.download;
    scratch.platform.download = async (...args) => {
      await download(...args);
      if (scratch.state.downloads === 60) owner.setDrawing(true);
    };
    await owner.initialize();
    owner.engage();
    await owner.settled();
    owner.dispose();
    const fresh = createEnabledOfflineLibrary(scratch.platform, 'full');
    await fresh.initialize();
    expect((await readdir(scratch.root)).some((name) => name.startsWith('staging-'))).toBe(false);
    fresh.engage();
    await fresh.settled();
    expect(fresh.snapshot().installed).toHaveLength(7);
    expect(scratch.state.downloads).toBe(60 + 518);
  });

  it('shows only the current revision after compact to full relaunch while saved and live old artwork survives', async () => {
    const compact = catalogPack('dinosaur', 'compact');
    const store = createLibraryStore(scratch.platform);
    await store.install(compact, new AbortController().signal, false, () => {});
    const oldId = offlinePageId(compact, 'trex');
    const liveId = offlinePageId(compact, 'stegosaurus');
    const oldArt = await store.openPage(oldId);
    const liveArt = await store.openPage(liveId);
    const compactOwner = createEnabledOfflineLibrary(scratch.platform, 'compact');
    savedConsumer.owner = compactOwner;
    await compactOwner.initialize();
    const drawing = emptyDrawing(0, oldId);
    const picture = await savePicture(drawing);
    const full = createEnabledOfflineLibrary(scratch.platform, 'full');
    await full.initialize();
    expect(full.snapshot()).toMatchObject({ installed: [], retainedBytes: compact.bytes });
    full.engage();
    await full.settled();
    expect(
      full
        .snapshot()
        .installed.filter((pack) => pack.id === 'dinosaur')
        .map((pack) => pack.revision)
    ).toEqual([dinosaur.revision]);
    const fresh = createEnabledOfflineLibrary(scratch.platform, 'full');
    savedConsumer.owner = fresh;
    scratch.state.online = false;
    await fresh.initialize();
    fresh.engage();
    await fresh.settled();
    expect(fresh.snapshot().installed).toHaveLength(7);
    expect(
      fresh
        .snapshot()
        .installed.filter((pack) => pack.id === 'dinosaur')
        .map((pack) => pack.revision)
    ).toEqual([dinosaur.revision]);
    expect(await readSavedNativePicture(picture.id)).toEqual(drawing);
    await fresh.openPage(oldId);
    expect(fresh.snapshot().artwork[oldId]).toEqual(oldArt);
    await fresh.openPage(liveId);
    expect(fresh.snapshot().artwork[liveId]).toEqual(liveArt);
    await fresh.remove(async () => [...(await savedColoringPageIds()), liveId]);
    expect(fresh.snapshot()).toMatchObject({ installed: [], retainedBytes: compact.bytes });
    expect(await store.openPage(oldId)).toEqual(oldArt);
    expect(await store.openPage(liveId)).toEqual(liveArt);
  });
});
