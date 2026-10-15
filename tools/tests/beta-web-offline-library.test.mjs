import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibraryPlatform } from '../../experiments/native-architecture/src/platform/offlineLibrary.web.ts';
import { createDeferredLibrary } from '../../experiments/native-architecture/src/offlineLibrary/deferredLibrary.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import {
  LIBRARY_DATABASE,
  MAX_LIBRARY_PATHS,
  readLibraryStartupDisposition,
} from '../../experiments/native-architecture/src/platform/offlineLibraryStorage.web.ts';
import { LIBRARY_FILE_TIMEOUT_MS } from '../../experiments/native-architecture/src/platform/offlineLibraryTransfer.web.ts';
import {
  createLibraryStore,
  packDirectory,
} from '../../experiments/native-architecture/src/offlineLibrary/store.ts';
import { catalogPack } from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { MAX_PACK_FILE_BYTES } from '../../experiments/native-architecture/src/offlineLibrary/manifest.ts';
import { LIBRARY_TEXT_LIMIT_BYTES } from '../../experiments/native-architecture/src/offlineLibrary/contract.ts';

const idb = vi.hoisted(() => ({
  rows: new Map(),
  idle: null,
  failCommit: false,
  delayCommit: false,
  release: null,
  opens: [],
  corruptReadback: false,
}));
vi.mock('../../web/src/lib/idle.ts', () => ({
  scheduleIdle(callback) {
    let cancelled = false;
    const run = () => {
      if (!cancelled) callback();
    };
    if (idb.idle) idb.idle.push(run);
    else queueMicrotask(run);
    return () => {
      cancelled = true;
    };
  },
}));
vi.mock('../../web/src/lib/idbDatabase.ts', () => ({
  openDatabase: vi.fn(async (name, store) => {
    idb.opens.push([name, store]);
    return {
      closed: new Promise(() => {}),
      transaction(_store, mode) {
        const working = structuredClone(idb.rows);
        let wrote = false;
        let resolveDone;
        let rejectDone;
        const done = new Promise((resolve, reject) => {
          resolveDone = resolve;
          rejectDone = reject;
        });
        const commit = () => {
          if (idb.failCommit && mode === 'readwrite')
            rejectDone(new DOMException('quota exceeded', 'QuotaExceededError'));
          else {
            if (mode === 'readwrite') idb.rows = working;
            resolveDone();
          }
        };
        const timer = setTimeout(() => {
          if (idb.delayCommit && mode === 'readwrite') idb.release = commit;
          else commit();
        }, 0);
        return {
          store: {
            async get(key) {
              if (idb.corruptReadback && wrote && key !== '@paths') {
                idb.corruptReadback = false;
                return new Uint8Array([255]);
              }
              return structuredClone(working.get(key));
            },
            async put(value, key) {
              wrote = true;
              working.set(key, structuredClone(value));
            },
          },
          done: done.finally(() => clearTimeout(timer)),
        };
      },
    };
  }),
}));

const bytes = new TextEncoder().encode('bounded coloring asset');
const digest = (value) => createHash('sha256').update(value).digest('hex');
let owners;
let fetchMock;
let revoke;
let createUrl;
const revision = 'a'.repeat(64);
const directory = `dinosaur-${revision}`;
const assetPath = '/coloring/dinosaur/cover.thumb.webp';
const file = {
  path: assetPath,
  downloadPath: assetPath,
  bytes: bytes.length,
  sha256: digest(bytes),
};
const path = `${directory}/files/cover.thumb.webp`;
const staged = `staging-${path}`;
function platform() {
  const owner = createLibraryPlatform();
  owners.push(owner);
  return owner;
}
function downloadFile(owner) {
  return owner.download(staged, file, new AbortController().signal, false, vi.fn());
}
function response(value = bytes, overrides = {}) {
  return {
    ok: true,
    url: new URL(assetPath, location.origin).href,
    redirected: false,
    headers: new Headers({ 'content-length': String(value.length) }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(value);
        controller.close();
      },
    }),
    ...overrides,
  };
}
function fixturePack() {
  const catalog = catalogPack('dinosaur', 'full');
  const files = catalog.files.map((entry) => ({
    ...entry,
    bytes: bytes.length,
    sha256: digest(bytes),
  }));
  return {
    ...catalog,
    files,
    bytes: bytes.length * files.length,
    revision: digest(JSON.stringify(files)),
  };
}
async function installFixture(owner, pack) {
  const root = packDirectory(pack);
  for (const entry of pack.files)
    await owner.write(`${root}/files/${entry.path.split('/').at(-1)}`, bytes);
  await owner.write(`${root}/identity.json`, new TextEncoder().encode(JSON.stringify(pack.files)));
  await owner.write(`${root}/installed.json`, new TextEncoder().encode(JSON.stringify(pack)));
}

beforeEach(() => {
  owners = [];
  idb.rows = new Map();
  idb.idle = null;
  idb.failCommit = false;
  idb.delayCommit = false;
  idb.release = null;
  idb.opens = [];
  idb.corruptReadback = false;
  fetchMock = vi.fn(() => Promise.reject(new Error('Unexpected network request')));
  revoke = vi.fn();
  createUrl = vi.fn(() => `blob:https://beta.invalid/${createUrl.mock.calls.length}`);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', new URL('http://localhost:5301'));
  vi.stubGlobal('navigator', {
    onLine: true,
    connection: { type: 'wifi', saveData: false },
    storage: { estimate: vi.fn(async () => ({ quota: 1_000_000_000, usage: 100 })) },
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
});
afterEach(() => {
  owners.forEach((owner) => owner.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('beta browser coloring library', () => {
  it('waits for idle between web files while drawing without cancelling the transfer', async () => {
    idb.idle = [];
    fetchMock.mockResolvedValue(response());
    const owner = platform();
    owner.setDrawing(true);
    const abort = new AbortController();
    const downloading = owner.download(staged, file, abort.signal, false, () => {});
    await vi.waitFor(() => expect(idb.idle).toHaveLength(1));
    idb.idle.shift()();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(abort.signal.aborted).toBe(false);
    expect(idb.idle).toHaveLength(1);
    owner.setDrawing(false);
    idb.idle.shift()();
    await downloading;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await owner.verify(staged, file)).toBe(true);
  });

  it('cancels a pending web idle wait when downloaded pictures are removed', async () => {
    idb.idle = [];
    const owner = platform();
    const abort = new AbortController();
    const downloading = owner.download(staged, file, abort.signal, false, () => {});
    const rejected = downloading.catch((error) => error);
    await vi.waitFor(() => expect(idb.idle).toHaveLength(1));
    abort.abort();
    expect(await rejected).toMatchObject({ code: 'cancelled' });
    idb.idle.shift()();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'restores saved mobile-data policy %s without installed packs',
    async (allowMetered) => {
      expect(await readLibraryStartupDisposition()).toBe('defer');
      idb.rows.set('@paths', ['policy.json']);
      idb.rows.set(
        'policy.json',
        new TextEncoder().encode(JSON.stringify({ enabled: false, allowMetered }))
      );
      expect(await readLibraryStartupDisposition()).toBe('hydrate');
      const library = createDeferredLibrary(
        async () => createOfflineLibrary(platform(), 'full'),
        async () => {},
        readLibraryStartupDisposition
      );
      await library.initialize();
      expect(library.snapshot()).toMatchObject({ enabled: false, allowMetered, inventoried: true });
      idb.rows.delete('policy.json');
      idb.rows.set('@paths', [`staging-${directory}/identity.json`]);
      expect(await readLibraryStartupDisposition()).toBe('resume');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'holds enabled policy-only mobile data %s until child engagement',
    async (allowMetered) => {
      idb.rows.set('@paths', ['policy.json']);
      idb.rows.set(
        'policy.json',
        new TextEncoder().encode(JSON.stringify({ enabled: true, allowMetered }))
      );
      const controller = createOfflineLibrary(platform(), 'full');
      const library = createDeferredLibrary(
        async () => controller,
        async () => {},
        readLibraryStartupDisposition
      );
      library.setFeatureEnabled(true);
      await library.initialize();
      await controller.settled();
      expect(library.snapshot()).toMatchObject({
        enabled: true,
        allowMetered,
        inventoried: true,
        installed: [],
      });
      expect(fetchMock).not.toHaveBeenCalled();
      library.engage();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      await controller.settled();
      controller.dispose();
    }
  );

  it('keeps isolated durable bytes across new owners and exposes only verified object URLs', async () => {
    const first = platform();
    await first.write(path, bytes);
    expect(() => first.uri(path)).toThrow('not been verified');
    first.dispose();
    const second = platform();
    expect(await second.verify(path, file)).toBe(true);
    expect(second.uri(path)).toMatch(/^blob:/);
    expect(await second.read(path, bytes.length)).toEqual(bytes);
    expect(idb.opens).toEqual([
      [LIBRARY_DATABASE, 'files'],
      [LIBRARY_DATABASE, 'files'],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['../policy.json', '/policy.json', 'a//b', 'a/./b', 'a/../b', 'a\\b', 'a/%2e'])(
    'rejects unsafe path %s before storage',
    async (unsafe) => {
      await expect(platform().write(unsafe, bytes)).rejects.toMatchObject({ code: 'unavailable' });
      expect(idb.opens).toEqual([]);
    }
  );
  it('bounds reads and verifies both exact length and digest', async () => {
    const owner = platform();
    await owner.write(path, bytes);
    await expect(owner.read(path, bytes.length - 1)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await owner.verify(path, { ...file, sha256: '0'.repeat(64) })).toBe(false);
    expect(await owner.verify(path, { ...file, bytes: bytes.length + 1 })).toBe(false);
    await expect(owner.write(path, new Uint8Array(MAX_PACK_FILE_BYTES + 1))).rejects.toMatchObject({
      code: 'corrupt',
    });
    expect(createUrl).not.toHaveBeenCalled();
  });
  it('does not resolve a write before its transaction commits', async () => {
    const owner = platform();
    idb.delayCommit = true;
    let completed = false;
    const writing = owner.write(path, bytes).then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(idb.release).toBeTypeOf('function'));
    expect(completed).toBe(false);
    expect(idb.rows.has(path)).toBe(false);
    idb.delayCommit = false;
    idb.release();
    await writing;
    expect(completed).toBe(true);
    expect(await owner.read(path, bytes.length)).toEqual(bytes);
  });
  it('waits for transaction completion and preserves committed bytes when completion aborts', async () => {
    const owner = platform();
    await owner.write(path, bytes);
    idb.failCommit = true;
    await expect(owner.write(path, new Uint8Array([4]))).rejects.toMatchObject({
      code: 'storage-full',
    });
    idb.failCommit = false;
    expect(await owner.read(path, bytes.length)).toEqual(bytes);
  });
  it('restores previous rows if in-transaction readback mismatches', async () => {
    const owner = platform();
    await owner.write(path, bytes);
    idb.corruptReadback = true;
    await expect(owner.write(path, new Uint8Array([4]))).rejects.toMatchObject({ code: 'corrupt' });
    expect(await owner.read(path, bytes.length)).toEqual(bytes);
  });
  it('rejects an oversized stored index before mutating existing content', async () => {
    const owner = platform();
    await owner.write(path, bytes);
    idb.rows.set('@paths', new Array(MAX_LIBRARY_PATHS + 1).fill(path));
    await expect(owner.remove(directory)).rejects.toMatchObject({ code: 'corrupt' });
    expect(idb.rows.get(path)).toEqual(bytes);
  });
  it('refuses to overwrite an orphaned destination or delete an indexed missing row', async () => {
    const owner = platform();
    await owner.write(staged, bytes);
    idb.rows.set(path, new Uint8Array([9]));
    await expect(owner.move(staged, path)).rejects.toMatchObject({ code: 'corrupt' });
    expect(idb.rows.get(path)).toEqual(new Uint8Array([9]));
    expect(idb.rows.get(staged)).toEqual(bytes);
    idb.rows.set(staged, undefined);
    await expect(owner.remove(`staging-${directory}`)).rejects.toMatchObject({ code: 'corrupt' });
    expect(idb.rows.get('@paths')).toContain(staged);
  });
  it('moves verified bytes atomically and revokes URLs only after successful replacement or removal', async () => {
    const owner = platform();
    await owner.write(staged, bytes);
    await owner.verify(staged, file);
    const uri = owner.uri(staged);
    await owner.move(staged, path);
    expect(owner.uri(path)).toBe(uri);
    expect(await owner.read(staged, bytes.length)).toBeNull();
    idb.failCommit = true;
    await expect(owner.remove(directory)).rejects.toMatchObject({ code: 'storage-full' });
    expect(revoke).not.toHaveBeenCalled();
    idb.failCommit = false;
    await owner.remove(directory);
    expect(await owner.read(path, bytes.length)).toBeNull();
    expect(revoke).toHaveBeenCalledWith(uri);
  });
  it('removes the installed revision and revokes its in-use URI', async () => {
    const owner = platform();
    const pack = fixturePack();
    await installFixture(owner, pack);
    const store = createLibraryStore(owner);
    const installed = await store.scan();
    expect(installed).toHaveLength(1);
    const cover = store.cover(pack, false);
    await store.remove();
    expect(
      await owner.read(`${packDirectory(pack)}/installed.json`, LIBRARY_TEXT_LIMIT_BYTES)
    ).toBeNull();
    expect(revoke).toHaveBeenCalledWith(cover);
    expect(await store.scan()).toEqual([]);
  });
  it('downloads only an approved staged file using an exact bounded verified stream', async () => {
    const owner = platform();
    fetchMock.mockResolvedValue(response());
    const progress = vi.fn();
    await owner.download(staged, file, new AbortController().signal, false, progress);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(assetPath, location.origin).href,
      expect.objectContaining({
        redirect: 'error',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      })
    );
    expect(await owner.verify(staged, file)).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(bytes.length);
  });
  it.each(['http://localhost:5301', 'https://beta.splotch.art'])(
    'keeps public coloring downloads on the app origin %s',
    async (origin) => {
      vi.stubGlobal('location', new URL(origin));
      fetchMock.mockResolvedValue(response());
      await downloadFile(platform());
      expect(fetchMock.mock.calls[0][0]).toBe(`${origin}${assetPath}`);
    }
  );
  it('reports a failed asset transfer without claiming local storage failed', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(downloadFile(platform())).rejects.toMatchObject({
      code: 'unavailable',
      message: 'This coloring book could not be downloaded. Try again later.',
    });
    expect(idb.rows.has(staged)).toBe(false);
  });
  it.each(['offline', 'metered'])('blocks %s before opening a network request', async (fault) => {
    vi.stubGlobal('navigator', {
      onLine: fault !== 'offline',
      connection: { saveData: fault === 'metered' },
      storage: { estimate: vi.fn(async () => ({})) },
    });
    await expect(downloadFile(platform())).rejects.toMatchObject({ code: fault });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a cancelled owner before starting a request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      platform().download(staged, file, controller.signal, false, vi.fn())
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rechecks network policy before accepting streamed bytes', async () => {
    const owner = platform();
    fetchMock.mockImplementation(async () => {
      navigator.connection.saveData = true;
      return response();
    });
    await expect(downloadFile(owner)).rejects.toMatchObject({ code: 'metered' });
    expect(idb.rows.has(staged)).toBe(false);
  });
  it.each(['oversized', 'short', 'digest', 'redirect'])(
    'rejects a %s response without replacing committed staged bytes',
    async (failure) => {
      const owner = platform();
      await owner.write(staged, bytes);
      const incoming =
        failure === 'oversized'
          ? new Uint8Array(bytes.length + 1)
          : failure === 'short'
            ? bytes.slice(1)
            : new Uint8Array(bytes.length);
      fetchMock.mockResolvedValue(
        response(incoming, { headers: new Headers(), redirected: failure === 'redirect' })
      );
      await expect(downloadFile(owner)).rejects.toHaveProperty('code');
      expect(await owner.read(staged, bytes.length)).toEqual(bytes);
    }
  );
  it('cancels a stalled reader at the deadline without writing incomplete bytes', async () => {
    const owner = platform();
    fetchMock.mockResolvedValue(
      response(bytes, {
        body: new ReadableStream({
          pull() {
            return new Promise(() => {});
          },
        }),
      })
    );
    vi.useFakeTimers();
    const download = downloadFile(owner);
    const outcome = download.then(
      () => null,
      (error) => error
    );
    await vi.advanceTimersByTimeAsync(LIBRARY_FILE_TIMEOUT_MS);
    expect(await outcome).toMatchObject({ code: 'unavailable' });
    expect(idb.rows.has(staged)).toBe(false);
  });
  it('aborts active downloads and revokes verified URLs when disposed', async () => {
    const owner = platform();
    await owner.write(path, bytes);
    await owner.verify(path, file);
    const uri = owner.uri(path);
    let started;
    const startedPromise = new Promise((resolve) => {
      started = resolve;
    });
    fetchMock.mockImplementation((_url, options) => {
      started(options.signal);
      return new Promise(() => {});
    });
    const download = downloadFile(owner);
    const signal = await startedPromise;
    const outcome = download.then(
      () => null,
      (error) => error
    );
    owner.dispose();
    expect(await outcome).toMatchObject({ code: 'cancelled' });
    expect(signal.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledWith(uri);
  });
});
