import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogPack } from '../../src/offlineLibrary/catalog.ts';
import { offlinePageId } from '../../src/offlineLibrary/identity.ts';
import { createLibraryStore } from '../../src/offlineLibrary/store.ts';
import { createOfflineLibrary } from '../../src/offlineLibrary/controller.ts';
import { LibraryFault } from '../../src/offlineLibrary/contract.ts';

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

  it('keeps a download failure visible while existing artwork is opened', async () => {
    await createLibraryStore(scratch.platform).install(
      dinosaur,
      new AbortController().signal,
      false,
      () => {}
    );
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    await owner.initialize();
    scratch.state.corrupt = true;
    owner.engage();
    await owner.settled();
    const failed = owner.snapshot();
    expect(failed.fault).toBe('corrupt');
    const id = offlinePageId(dinosaur, 'trex');
    await owner.openPage(id);
    expect(owner.snapshot()).toMatchObject({
      status: failed.status,
      fault: failed.fault,
      message: failed.message,
    });
    expect(scratch.state.downloads).toBe(75);
  });

  it('pauses removal for the session and downloads all removed books on the next launch', async () => {
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    await owner.initialize();
    owner.engage();
    await owner.settled();
    await owner.setPolicy(true, false);
    const pageId = offlinePageId(dinosaur, 'trex');
    const artwork = await createLibraryStore(scratch.platform).openPage(pageId);
    await owner.remove();
    expect(owner.snapshot()).toMatchObject({ enabled: true, installed: [] });
    owner.retryStalled();
    await owner.settled();
    expect(scratch.state.downloads).toBe(518);
    expect(JSON.parse(await readFile(join(scratch.root, 'policy.json'), 'utf8'))).toEqual({
      enabled: true,
      allowMetered: false,
    });
    const fresh = createEnabledOfflineLibrary(scratch.platform, 'full');
    await fresh.initialize();
    fresh.engage();
    await fresh.settled();
    expect(scratch.state.online).toBe(true);
    expect(scratch.state.downloads).toBe(518 + 7 * 74);
    expect(fresh.snapshot().enabled).toBe(true);
    expect(fresh.snapshot().installed).toHaveLength(7);
    await fresh.openPage(pageId);
    expect(fresh.snapshot().artwork[pageId]).toEqual(artwork);
    expect(scratch.state.downloads).toBe(518 + 7 * 74);
  });

  it('removes downloaded bytes without requiring a write that disables their download policy', async () => {
    await createLibraryStore(scratch.platform).install(
      dinosaur,
      new AbortController().signal,
      false,
      () => {}
    );
    const owner = createEnabledOfflineLibrary(scratch.platform, 'full');
    await owner.initialize();
    scratch.state.failWrite = true;
    await owner.remove();
    expect(owner.snapshot()).toMatchObject({ status: 'ready', enabled: true, installed: [] });
    expect(await createLibraryStore(scratch.platform).scan()).toEqual([]);
  });
});
