import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibraryPlatform as createWebLibraryPlatform } from '../../experiments/native-architecture/src/platform/offlineLibrary.web.ts';
import { createDeferredLibrary } from '../../experiments/native-architecture/src/offlineLibrary/deferredLibrary.ts';
import { createOfflineLibrary } from '../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import {
  initialLibrarySnapshot,
  LIBRARY_UNAVAILABLE_MESSAGE,
} from '../../experiments/native-architecture/src/offlineLibrary/snapshot.ts';
import { encodeLibraryText } from '../../experiments/native-architecture/src/offlineLibrary/contract.ts';
import { OFFLINE_BOOKS } from '../../experiments/native-architecture/src/offlineLibrary/books.generated.ts';
import { afterDrawingPaint } from '../../experiments/native-architecture/src/product/afterDrawingPaint.ts';
import { drawingPaint } from '../../experiments/native-architecture/src/product/drawingPaint.ts';

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
  const library = createDeferredLibrary(
    load,
    () => idle.promise,
    async () => 'resume'
  );
  return { controller, chunk, idle, load, library };
}

describe('the offline library on web before its controller loads', () => {
  it('holds a first web visit until engagement, then loads at idle', async () => {
    const controller = recordingController();
    const firstIdle = deferred();
    const engagedIdle = deferred();
    const idle = vi
      .fn()
      .mockReturnValueOnce(firstIdle.promise)
      .mockReturnValue(engagedIdle.promise);
    const load = vi.fn(async () => controller);
    const library = createDeferredLibrary(load, idle, async () => 'defer');
    library.setFeatureEnabled(true);
    const initialized = library.initialize();
    firstIdle.resolve();
    await initialized;
    expect(load).not.toHaveBeenCalled();
    expect(library.snapshot()).toMatchObject({ status: 'ready', inventoried: true, installed: [] });
    library.engage();
    await flush();
    expect(load).not.toHaveBeenCalled();
    engagedIdle.resolve();
    await flush();
    expect(load).toHaveBeenCalledOnce();
    expect(controller.calls).toContainEqual(['engage']);
  });

  it('resumes a repeat web visit with existing pack storage at idle without picker engagement', async () => {
    const controller = recordingController();
    const idle = deferred();
    const load = vi.fn(async () => controller);
    const library = createDeferredLibrary(
      load,
      () => idle.promise,
      async () => 'resume'
    );
    const initialized = library.initialize();
    await flush();
    expect(load).not.toHaveBeenCalled();
    idle.resolve();
    await initialized;
    expect(controller.calls).toContainEqual(['engage']);
    expect(controller.initialize).toHaveBeenCalledOnce();
  });

  it('hydrates a policy-only visit without admitting a first download', async () => {
    const controller = recordingController();
    const library = createDeferredLibrary(
      async () => controller,
      async () => {},
      async () => 'hydrate'
    );
    await library.initialize();
    expect(controller.calls).toEqual([['initialize']]);
  });

  it('keeps early Settings policy hydration separate from child engagement', async () => {
    const controller = recordingController();
    const readDisposition = vi.fn(async () => 'hydrate');
    const library = createDeferredLibrary(
      async () => controller,
      async () => {},
      readDisposition
    );
    await library.setPolicy(true, true);
    await library.initialize();
    expect(readDisposition).toHaveBeenCalledOnce();
    expect(controller.calls).toEqual([['setPolicy', true, true], ['initialize']]);
  });

  it('retains explicit child engagement before deferred initialization', async () => {
    const controller = recordingController();
    const library = createDeferredLibrary(
      async () => controller,
      async () => {},
      async () => 'defer'
    );
    library.engage();
    await library.initialize();
    await flush();
    expect(controller.calls.filter(([name]) => name === 'engage')).toEqual([['engage']]);
    expect(controller.initialize).toHaveBeenCalled();
  });

  it('retains child engagement after early Settings hydration and before initialization', async () => {
    const controller = recordingController();
    const library = createDeferredLibrary(
      async () => controller,
      async () => {},
      async () => 'hydrate'
    );
    await library.setPolicy(true, true);
    library.engage();
    await library.initialize();
    await flush();
    expect(controller.calls.filter(([name]) => name === 'engage')).toEqual([['engage']]);
    expect(controller.initialize).toHaveBeenCalled();
  });

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
      ['engage'],
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
    [
      'opening an offline page',
      (library) => library.openPage(OFFLINE_PAGE),
      ['openPage', OFFLINE_PAGE],
    ],
    [
      'changing the policy',
      (library) => library.setPolicy(false, true),
      ['setPolicy', false, true],
    ],
    ['removing books', (library) => library.remove(), ['remove']],
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
    const { controller, chunk, idle, library } = deferredFixture();
    library.engage();
    idle.resolve();
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
    const library = createDeferredLibrary(
      load,
      async () => {},
      async () => 'resume'
    );

    library.retryStalled();
    expect(load).not.toHaveBeenCalled();
    library.engage();
    await flush();
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
      () => idle.promise,
      async () => 'resume'
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
      async () => {},
      async () => 'resume'
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

it('holds native boot work until the drawing has painted and a native idle callback runs', async () => {
  let enterIdle;
  const idle = vi.fn((callback) => {
    enterIdle = callback;
    return 1;
  });
  vi.stubGlobal('requestIdleCallback', idle);
  try {
    let completed = false;
    const waiting = afterDrawingPaint().then(() => {
      completed = true;
    });
    await flush();
    expect(idle).not.toHaveBeenCalled();
    drawingPaint.mark();
    await flush();
    expect(idle).toHaveBeenCalledOnce();
    expect(completed).toBe(false);
    enterIdle();
    await waiting;
    expect(completed).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('web startup network policy', () => {
  let webPlatform, fetchMock;
  beforeEach(() => {
    webPlatform = createWebLibraryPlatform();
    fetchMock = vi.fn(() => Promise.reject(new Error('Unexpected network request')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', {
      onLine: true,
      connection: { type: 'wifi', saveData: false },
      storage: { estimate: vi.fn(async () => ({ quota: 1_000_000_000, usage: 100 })) },
    });
  });
  afterEach(() => {
    webPlatform.dispose();
    vi.unstubAllGlobals();
  });
  it.each([
    undefined,
    {},
    { effectiveType: '4g' },
    { type: 'wifi' },
    { type: 'ethernet' },
    { metered: true },
  ])('allows ordinary web downloads for connection %j, as shipping does', async (connection) => {
    navigator.connection = connection;
    expect((await webPlatform.environment()).metered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { saveData: true },
    { type: 'cellular' },
    { effectiveType: '2g' },
    { effectiveType: 'slow-2g' },
  ])('holds automatic web downloads for connection %j, as shipping does', async (connection) => {
    navigator.connection = connection;
    expect((await webPlatform.environment()).metered).toBe(true);
  });
  it('pins the ordinary web network fallback and opt-out policy to shipping', () => {
    const shipping = readFileSync(
      new URL('../../web/src/lib/coloringPacks/manager.ts', import.meta.url),
      'utf8'
    );
    expect(shipping).toContain('if (!network) return true;');
    expect(shipping).toContain('settingsState.coloringPacksAllowMetered');
    expect(
      readFileSync(new URL('../../web/src/lib/boot/coloringPacks.ts', import.meta.url), 'utf8')
    ).toContain('heldForEngagement = !hasPackStorage && !engaged;');
    expect(shipping).toContain(
      "if (network.saveData || network.type === 'cellular') return false;"
    );
    expect(shipping).toContain(
      "network.effectiveType !== 'slow-2g' && network.effectiveType !== '2g'"
    );
  });

  it('reports quota and connection uncertainty without requesting persistence', async () => {
    const owner = webPlatform;
    expect(await owner.environment()).toEqual({
      online: true,
      metered: false,
      freeBytes: 999_999_900,
    });
    vi.stubGlobal('navigator', {
      onLine: false,
      connection: { saveData: true },
      storage: { estimate: vi.fn(async () => ({})), persist: vi.fn() },
    });
    expect(await owner.environment()).toEqual({ online: false, metered: true, freeBytes: 0 });
    expect(navigator.storage.persist).not.toHaveBeenCalled();
  });
});
