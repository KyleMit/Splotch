import { describe, expect, it, vi } from 'vitest';
import { createDeferredLibrary } from '../../experiments/native-architecture/src/offlineLibrary/deferredLibrary.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import {
  initialLibrarySnapshot,
  LIBRARY_UNAVAILABLE_MESSAGE,
} from '../../experiments/native-architecture/src/offlineLibrary/snapshot.ts';
import { encodeLibraryText } from '../../experiments/native-architecture/src/offlineLibrary/contract.ts';
import { OFFLINE_BOOKS } from '../../experiments/native-architecture/src/offlineLibrary/books.generated.ts';

const OFFLINE_PAGE = `offline:${OFFLINE_BOOKS[0].id}:${OFFLINE_BOOKS[0].pages[0].slug}:${'a'.repeat(64)}`;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

// A controller that records the calls it receives, in order.
function recordingController() {
  const calls = [];
  const listeners = new Set();
  let state = { ...initialLibrarySnapshot, status: 'ready' };
  const record =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
    };
  return {
    calls,
    publish(next) {
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize: vi.fn(async () => record('initialize')()),
    setFeatureEnabled: record('setFeatureEnabled'),
    engage: record('engage'),
    setActive: record('setActive'),
    setDrawing: record('setDrawing'),
    cancel: record('cancel'),
    retry: record('retry'),
    retryStalled: record('retryStalled'),
    setPolicy: vi.fn(async (...args) => record('setPolicy')(...args)),
    openPage: vi.fn(async (...args) => record('openPage')(...args)),
    withSavedArtwork: vi.fn(async (pageId, action) => {
      calls.push(['withSavedArtwork', pageId]);
      return action();
    }),
    remove: vi.fn(async () => record('remove')()),
    cover: (pack, dark) => `cover:${pack.id}:${dark}`,
    selector: (pack, page, orientation, dark) =>
      `selector:${pack.id}:${page}:${orientation}:${dark}`,
  };
}

function deferredFixture() {
  const controller = recordingController();
  const chunk = deferred();
  const idle = deferred();
  const load = vi.fn(() => chunk.promise);
  const library = createDeferredLibrary(load, () => idle.promise);
  return { controller, chunk, idle, load, library };
}

describe('the offline library on web before its controller loads', () => {
  it('reports the controller’s loading snapshot and fetches nothing for settings alone', async () => {
    const { load, library } = deferredFixture();

    library.setFeatureEnabled(true);
    library.setActive(true);
    library.setDrawing(false);
    library.cancel();
    await library.openPage('farm/cat');
    await flush();

    expect(library.snapshot()).toBe(initialLibrarySnapshot);
    expect(load).not.toHaveBeenCalled();
  });

  it('takes the launch inventory once the page has loaded, then replays settings in order', async () => {
    const { controller, chunk, idle, load, library } = deferredFixture();
    const seen = vi.fn();
    library.subscribe(seen);
    library.setFeatureEnabled(true);
    library.setActive(true);
    library.setDrawing(true);

    const initialized = library.initialize();
    await flush();
    expect(load).not.toHaveBeenCalled();
    idle.resolve();
    await flush();
    expect(load).toHaveBeenCalledOnce();
    chunk.resolve(controller);
    await initialized;

    expect(controller.calls).toEqual([
      ['setFeatureEnabled', true],
      ['setActive', true],
      ['setDrawing', true],
      ['initialize'],
    ]);
    expect(library.snapshot()).toBe(controller.snapshot());
    expect(seen).toHaveBeenCalled();
    seen.mockClear();
    controller.publish({ message: 'Dinosaurs is ready offline.' });
    expect(seen).toHaveBeenCalledOnce();
    expect(library.snapshot().message).toBe('Dinosaurs is ready offline.');
  });

  it.each([
    ['engaging the picker', (library) => library.engage(), ['engage']],
    [
      'opening an offline page',
      (library) => library.openPage(OFFLINE_PAGE),
      ['openPage', OFFLINE_PAGE],
    ],
    [
      'saving over offline artwork',
      (library) => library.withSavedArtwork(OFFLINE_PAGE, async () => {}),
      ['withSavedArtwork', OFFLINE_PAGE],
    ],
    [
      'changing the policy',
      (library) => library.setPolicy(false, true),
      ['setPolicy', false, true],
    ],
    ['removing books', (library) => library.remove(async () => []), ['remove']],
  ])('loads the controller at once for %s', async (_name, act, expected) => {
    const { controller, chunk, load, library } = deferredFixture();
    library.setFeatureEnabled(true);

    const acting = act(library);
    expect(load).toHaveBeenCalledOnce();
    chunk.resolve(controller);
    await acting;
    await flush();

    expect(controller.calls).toEqual([['setFeatureEnabled', true], expected]);
  });

  it('forwards every later call straight to the loaded controller', async () => {
    const { controller, chunk, library } = deferredFixture();
    library.engage();
    chunk.resolve(controller);
    await flush();
    controller.calls.length = 0;

    library.setDrawing(true);
    library.cancel();
    library.retryStalled();

    expect(controller.calls).toEqual([['setDrawing', true], ['cancel'], ['retryStalled']]);
    expect(library.cover({ id: 'dinosaur' }, true)).toBe('cover:dinosaur:true');
    expect(library.selector({ id: 'dinosaur' }, 'egg', 'portrait', false)).toBe(
      'selector:dinosaur:egg:portrait:false'
    );
  });

  it('reports a failed chunk as the controller reports a failed catalog, and retries afresh', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const controller = recordingController();
    const failure = deferred();
    const load = vi
      .fn()
      .mockReturnValueOnce(failure.promise)
      .mockReturnValueOnce(Promise.resolve(controller));
    const library = createDeferredLibrary(load, async () => {});

    library.retryStalled();
    expect(load).not.toHaveBeenCalled();
    library.engage();
    failure.reject(new Error('chunk unavailable'));
    await flush();
    expect(library.snapshot()).toMatchObject({
      status: 'failed',
      fault: 'unavailable',
      message: LIBRARY_UNAVAILABLE_MESSAGE,
    });

    library.retryStalled();
    expect(library.snapshot()).toBe(initialLibrarySnapshot);
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
    expect(controller.calls).toEqual([['engage'], ['retry']]);
    expect(error).toHaveBeenCalledWith('The offline library failed to load:', expect.any(Error));
    error.mockRestore();
  });

  it('reads the saved policy and inventory through the real controller once the page has loaded', async () => {
    const policy = encodeLibraryText(JSON.stringify({ enabled: false, allowMetered: true }));
    const platform = memoryPlatform(async (path) => (path === 'policy.json' ? policy : null));
    const idle = deferred();
    const library = createDeferredLibrary(
      async () => createOfflineLibrary(platform, 'full'),
      () => idle.promise
    );

    const initialized = library.initialize();
    await flush();
    expect(platform.read).not.toHaveBeenCalled();
    idle.resolve();
    await initialized;

    expect(platform.read).toHaveBeenCalledWith('policy.json', expect.any(Number));
    expect(library.snapshot()).toMatchObject({
      status: 'ready',
      inventoried: true,
      enabled: false,
      allowMetered: true,
    });
  });

  it('marks the inventory taken only when one completes, not on a failure or Retry’s interim ready', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('catalog aborted'))
      .mockResolvedValue(null);
    const library = createDeferredLibrary(
      async () => createOfflineLibrary(memoryPlatform(read), 'full'),
      async () => {}
    );
    library.setFeatureEnabled(true);

    await library.initialize();
    expect(library.snapshot()).toMatchObject({ status: 'failed', inventoried: false });

    library.engage();
    library.retry();
    expect(library.snapshot()).toMatchObject({ status: 'ready', inventoried: false });
    await vi.waitFor(() => expect(library.snapshot().inventoried).toBe(true));
    error.mockRestore();
  });
});

function memoryPlatform(read) {
  const refused = async () => {
    throw new Error('Writes are outside this fixture.');
  };
  return {
    environment: async () => ({ online: false, metered: false, freeBytes: 0 }),
    list: async () => [],
    read: vi.fn(read),
    write: refused,
    remove: refused,
    move: refused,
    uri: (path) => `memory:${path}`,
    verify: async () => false,
    download: refused,
    dispose() {},
  };
}
