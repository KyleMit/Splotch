// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createLibraryPlatform } from '../../../src/platform/offlineLibrary.web.ts';
import { createOfflineLibrary } from '../../../src/offlineLibrary/controller.ts';
import { createDeferredLibrary } from '../../../src/offlineLibrary/deferredLibrary.ts';

// The connection shapes of the WEB-1 cell `coloring-connection-policy`, as navigator.connection
// reports them. Shipping's automaticDownloadAllowed (src/lib/coloringPacks/manager.ts) blocks
// the last three and downloads on the first two.
const CONNECTIONS = {
  'no Network Information API': { connection: undefined, metered: false },
  'desktop Chromium default': {
    connection: { effectiveType: '4g', saveData: false },
    metered: false,
  },
  'Save-Data': { connection: { effectiveType: '4g', saveData: true }, metered: true },
  '2g': { connection: { effectiveType: '2g', saveData: false }, metered: true },
  'slow-2g': { connection: { effectiveType: 'slow-2g', saveData: false }, metered: true },
  cellular: {
    connection: { type: 'cellular', effectiveType: '4g', saveData: false },
    metered: true,
  },
};

function reportConnection(connection) {
  Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
}

afterEach(() => {
  delete navigator.connection;
});

it.each(Object.entries(CONNECTIONS))(
  'classifies a %s connection for coloring downloads as shipping does',
  async (_name, { connection, metered }) => {
    reportConnection(connection);
    const platform = createLibraryPlatform();
    try {
      expect(await platform.environment()).toMatchObject({ online: true, metered });
    } finally {
      platform.dispose();
    }
  }
);

// A fresh web profile holds no library storage, so the launch inventory defers until the child
// engages (three strokes or the picker), as shipping's first visit does (issue #462).
function freshWebLibrary(metered) {
  const download = vi.fn(async () => {
    throw new Error('Fixture: the first book file stops the run once it is requested.');
  });
  const files = new Map();
  const platform = {
    environment: async () => ({ online: true, metered, freeBytes: 1e9 }),
    list: async () => [],
    read: async (path) => files.get(path) ?? null,
    verify: async (path, expected) => {
      const bytes = files.get(path);
      return (
        !!bytes &&
        bytes.length === expected.bytes &&
        createHash('sha256').update(bytes).digest('hex') === expected.sha256
      );
    },
    write: async (path, bytes) => {
      files.set(path, bytes);
    },
    move: async () => {},
    remove: async () => {},
    uri: (path) => path,
    download,
    dispose() {},
  };
  const library = createDeferredLibrary(
    async () => createOfflineLibrary(platform, 'full'),
    async () => {},
    async () => 'defer'
  );
  return { library, download };
}

async function engageFreshLibrary(metered) {
  const fresh = freshWebLibrary(metered);
  await fresh.library.initialize();
  fresh.library.setFeatureEnabled(true);
  expect(fresh.download).not.toHaveBeenCalled();
  fresh.library.engage();
  return fresh;
}

it('starts downloading the extra books on an unmetered connection once a fresh profile engages', async () => {
  const { library, download } = await engageFreshLibrary(false);
  await vi.waitFor(() => expect(download).toHaveBeenCalled());
  expect(download.mock.calls[0][0]).toMatch(/^staging-dinosaur-[a-f0-9]{64}\/files\//);
  await vi.waitFor(() => expect(library.snapshot().status).toBe('failed'));
});

it('waits without requesting a book file on a metered connection once a fresh profile engages', async () => {
  const { library, download } = await engageFreshLibrary(true);
  await vi.waitFor(() =>
    expect(library.snapshot()).toMatchObject({ status: 'waiting', fault: 'metered' })
  );
  expect(download).not.toHaveBeenCalled();
});
