import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogPack } from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { offlinePageId } from '../../experiments/native-architecture/src/offlineLibrary/identity.ts';
import { createLibraryStore } from '../../experiments/native-architecture/src/offlineLibrary/store.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { LibraryFault } from '../../experiments/native-architecture/src/offlineLibrary/contract.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
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

describe('R1 real controller and disk regression controls', () => {
  it.each(['corrupt', 'storage-full', 'offline', 'metered', 'unavailable'])(
    'keeps %s sticky across drawing and foreground changes until explicit retry',
    async (fault) => {
      const environment = scratch.platform.environment;
      let checks = 0;
      scratch.platform.environment = async () => {
        checks++;
        if (fault === 'unavailable') throw new LibraryFault('unavailable', 'Storage unavailable.');
        return environment();
      };
      scratch.state.corrupt = fault === 'corrupt';
      scratch.state.freeBytes = fault === 'storage-full' ? 1 : 1e9;
      scratch.state.online = fault !== 'offline';
      scratch.state.metered = fault === 'metered';
      const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
      await owner.initialize();
      owner.engage();
      await owner.settled();
      const failed = owner.snapshot();
      const attempts = scratch.state.downloads;
      const environmentChecks = checks;
      expect(failed.fault).toBe(fault);
      for (let stroke = 0; stroke < 3; stroke++) {
        owner.setDrawing(true);
        owner.setDrawing(false);
        owner.setActive(false);
        owner.setActive(true);
        owner.engage();
        await owner.settled();
        expect(owner.snapshot()).toEqual(failed);
      }
      expect(scratch.state.downloads).toBe(attempts);
      expect(checks).toBe(environmentChecks);
      scratch.platform.environment = environment;
      scratch.state.corrupt = false;
      scratch.state.freeBytes = 1e9;
      scratch.state.online = true;
      scratch.state.metered = false;
      scratch.state.entered = deferred();
      scratch.state.gate = deferred();
      owner.retry();
      await scratch.state.entered.promise;
      owner.cancel();
      scratch.state.gate.resolve();
      await owner.settled();
      expect(scratch.state.downloads).toBe(attempts + 1);
    }
  );

  it('keeps a download failure visible while real saved artwork is opened and saved', async () => {
    await createLibraryStore(scratch.platform).install(
      dinosaur,
      new AbortController().signal,
      false,
      () => {}
    );
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    savedConsumer.owner = owner;
    await owner.initialize();
    scratch.state.corrupt = true;
    owner.engage();
    await owner.settled();
    const failed = owner.snapshot();
    expect(failed.fault).toBe('corrupt');
    const id = offlinePageId(dinosaur, 'trex');
    await owner.openPage(id);
    const picture = await savePicture(emptyDrawing(0, id));
    await reopenPicture(picture.id);
    expect(owner.snapshot()).toMatchObject({
      status: failed.status,
      fault: failed.fault,
      message: failed.message,
    });
    expect(scratch.state.downloads).toBe(75);
  });

  it('persists removal while online, preserves real saved art and only downloads after explicit enable', async () => {
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    savedConsumer.owner = owner;
    await owner.initialize();
    owner.engage();
    await owner.settled();
    const drawing = emptyDrawing(0, offlinePageId(dinosaur, 'trex'));
    const picture = await savePicture(drawing);
    const artwork = await createLibraryStore(scratch.platform).openPage(drawing.pageId);
    await owner.remove(savedColoringPageIds);
    expect(owner.snapshot()).toMatchObject({ enabled: false, installed: [] });
    expect(JSON.parse(await readFile(join(scratch.root, 'policy.json'), 'utf8'))).toEqual({
      enabled: false,
      allowMetered: false,
    });
    const fresh = createEnabledOfflineLibrary(scratch.platform, 'full');
    savedConsumer.owner = fresh;
    await fresh.initialize();
    fresh.engage();
    await fresh.settled();
    expect(scratch.state.online).toBe(true);
    expect(scratch.state.downloads).toBe(518);
    expect(fresh.snapshot()).toMatchObject({
      enabled: false,
      installed: [],
      retainedBytes: dinosaur.bytes,
    });
    expect(await reopenPicture(picture.id)).toEqual(drawing);
    expect(fresh.snapshot().artwork[drawing.pageId]).toEqual(artwork);
    await fresh.setPolicy(true, false);
    await fresh.settled();
    expect(fresh.snapshot().installed).toHaveLength(7);
    expect(scratch.state.downloads).toBe(518 + 6 * 74);
  });

  it('keeps installed books when removal intent cannot be committed to private policy storage', async () => {
    await createLibraryStore(scratch.platform).install(
      dinosaur,
      new AbortController().signal,
      false,
      () => {}
    );
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    await owner.initialize();
    scratch.state.failWrite = true;
    await owner.remove(async () => []);
    expect(owner.snapshot()).toMatchObject({ status: 'failed', fault: 'storage-full' });
    expect((await createLibraryStore(scratch.platform).scan()).map((pack) => pack.id)).toEqual([
      'dinosaur',
    ]);
  });
});
