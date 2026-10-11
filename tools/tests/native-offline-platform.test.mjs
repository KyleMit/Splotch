import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
  renameSync,
  openSync,
  writeSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLibraryPlatform,
  LIBRARY_FILE_TIMEOUT_MS,
} from '../../experiments/native-architecture/src/platform/offlineLibrary.ts';
import {
  approvedAssetUrl,
  MAX_PACK_FILE_BYTES,
} from '../../experiments/native-architecture/src/offlineLibrary/manifest.ts';

const fixture = vi.hoisted(() => ({
  root: '',
  rootCreates: 0,
  diskReads: 0,
  online: true,
  metered: false,
  chunks: [],
  length: null,
  encoding: null,
  responseUrl: '',
  afterChunk: null,
  fetch: vi.fn(),
  bridge: null,
}));
vi.mock('react-native', () => ({
  NativeModules: {
    get SplotchLibraryEnvironment() {
      return fixture.bridge;
    },
  },
}));
vi.mock('expo/fetch', () => ({ fetch: (...args) => fixture.fetch(...args) }));
vi.mock('expo-file-system', () => {
  const pathOf = (value) =>
    typeof value === 'string' ? value.replace(/^file:\/\//, '') : value.path;
  class Directory {
    constructor(parent, ...parts) {
      this.path = join(pathOf(parent), ...parts);
    }
    get name() {
      return this.path.split('/').at(-1);
    }
    get exists() {
      return existsSync(this.path);
    }
    create() {
      if (this.path === fixture.root) fixture.rootCreates++;
      mkdirSync(this.path, { recursive: true });
    }
    delete() {
      rmSync(this.path, { recursive: true, force: true });
    }
    list() {
      return readdirSync(this.path).map((name) =>
        statSync(join(this.path, name)).isDirectory()
          ? new Directory(this, name)
          : new File(this, name)
      );
    }
  }
  class File extends Directory {
    get uri() {
      return `file://${this.path}`;
    }
    get size() {
      return statSync(this.path).size;
    }
    create() {
      writeFileSync(this.path, '');
    }
    write(bytes) {
      writeFileSync(this.path, bytes);
    }
    async bytes() {
      return readFileSync(this.path);
    }
    async move(destination) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      renameSync(this.path, destination.path);
      this.path = destination.path;
    }
    open() {
      const fd = openSync(this.path, 'w');
      return { writeBytes: (bytes) => writeSync(fd, bytes), close: () => closeSync(fd) };
    }
  }
  return {
    Directory,
    File,
    FileMode: { WriteOnly: 'w' },
    Paths: {
      get availableDiskSpace() {
        fixture.diskReads++;
        return 1e9;
      },
    },
  };
});
const bytes = new Uint8Array([10, 20, 30, 40]);
const expected = {
  path: '/coloring/dinosaur/trex-wide.overlay.svg',
  downloadPath: '/coloring/dinosaur/trex-wide.overlay.svg',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
let platform;
beforeEach(async () => {
  fixture.root = await mkdtemp(join(tmpdir(), 'splotch-library-platform-'));
  fixture.rootCreates = 0;
  fixture.diskReads = 0;
  fixture.online = true;
  fixture.metered = false;
  fixture.chunks = [bytes];
  fixture.length = String(bytes.length);
  fixture.encoding = null;
  fixture.responseUrl = approvedAssetUrl(expected.downloadPath);
  fixture.afterChunk = null;
  fixture.bridge = {
    async environment() {
      return {
        rootUri: `file://${fixture.root}`,
        online: fixture.online,
        metered: fixture.metered,
      };
    },
    async verify(uri, length, sha256) {
      const data = await readFile(uri.replace(/^file:\/\//, ''));
      return data.length === length && createHash('sha256').update(data).digest('hex') === sha256;
    },
  };
  fixture.fetch.mockReset().mockImplementation(async () => {
    let index = 0;
    return {
      ok: true,
      url: fixture.responseUrl,
      headers: { get: (name) => (name === 'content-encoding' ? fixture.encoding : fixture.length) },
      body: {
        getReader: () => ({
          async read() {
            if (index >= fixture.chunks.length) return { done: true };
            const value = fixture.chunks[index++];
            fixture.afterChunk?.();
            return { done: false, value };
          },
          async cancel() {},
        }),
      },
    };
  });
  platform = createLibraryPlatform();
  await platform.environment();
});
afterEach(async () => {
  await rm(fixture.root, { recursive: true, force: true });
});

describe('actual native library adapter with private disk and streamed transport boundaries', () => {
  it('checks every streamed chunk against native network state without repeated root or disk setup', async () => {
    fixture.chunks = Array.from({ length: 100 }, () => new Uint8Array([1]));
    fixture.length = '100';
    const environment = fixture.bridge.environment;
    let networkChecks = 0;
    fixture.bridge.environment = async () => {
      networkChecks++;
      return environment();
    };
    const file = {
      ...expected,
      bytes: 100,
      sha256: createHash('sha256').update(Buffer.alloc(100, 1)).digest('hex'),
    };
    await platform.download(
      'staging/files/chunks.svg',
      file,
      new AbortController().signal,
      false,
      () => {}
    );
    expect(networkChecks).toBe(101);
    expect(fixture.rootCreates).toBe(1);
    expect(fixture.diskReads).toBe(1);
    expect(await platform.verify('staging/files/chunks.svg', file)).toBe(true);
  });
  it('rejects a native private root change before accepting streamed bytes', async () => {
    fixture.afterChunk = () => {
      fixture.bridge.environment = async () => ({
        rootUri: 'file:///foreign',
        online: true,
        metered: false,
      });
    };
    await expect(
      platform.download(
        'staging/files/root.svg',
        expected,
        new AbortController().signal,
        false,
        () => {}
      )
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(await platform.read('staging/files/root.svg', 4)).toHaveLength(0);
  });

  it('streams exactly bounded bytes, verifies them with the native bridge and awaits publication moves', async () => {
    const progress = [];
    await platform.download(
      'staging-dinosaur/files/trex.svg',
      expected,
      new AbortController().signal,
      false,
      (bytes) => progress.push(bytes)
    );
    expect(fixture.fetch).toHaveBeenCalledWith(
      approvedAssetUrl(expected.downloadPath),
      expect.objectContaining({ redirect: 'error', credentials: 'omit' })
    );
    expect(progress).toEqual([4]);
    expect(await platform.verify('staging-dinosaur/files/trex.svg', expected)).toBe(true);
    await platform.move('staging-dinosaur/files/trex.svg', 'installed/files/trex.svg');
    expect([...(await platform.read('installed/files/trex.svg', 4))]).toEqual([...bytes]);
    await expect(platform.read('installed/files/trex.svg', 3)).rejects.toMatchObject({
      code: 'corrupt',
    });
  });
  it.each([
    'https://evil.example/coloring/dinosaur/trex-wide.overlay.svg',
    'https://splotch.art/coloring/dinosaur/redirect.svg',
  ])('refuses a transport response from %s', async (url) => {
    fixture.responseUrl = url;
    await expect(
      platform.download(
        'staging/files/a.svg',
        expected,
        new AbortController().signal,
        false,
        () => {}
      )
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([
    [new Uint8Array([1]), '4'],
    [new Uint8Array([1, 2, 3, 4, 5]), null],
    [bytes, '5'],
  ])('rejects missing, excessive or conflicting byte lengths', async (chunk, length) => {
    fixture.chunks = [chunk];
    fixture.length = length;
    await expect(
      platform.download(
        'staging/files/a.svg',
        expected,
        new AbortController().signal,
        false,
        () => {}
      )
    ).rejects.toMatchObject({ code: 'corrupt' });
  });
  it('checks decoded byte length and digest when HTTP compression changes Content-Length', async () => {
    fixture.encoding = 'gzip';
    fixture.length = '2';
    await platform.download(
      'staging/files/compressed.svg',
      expected,
      new AbortController().signal,
      false,
      () => {}
    );
    expect(await platform.verify('staging/files/compressed.svg', expected)).toBe(true);
  });
  it('bounds a stalled transfer and relays a real abort to the transport', async () => {
    vi.useFakeTimers();
    try {
      fixture.fetch.mockImplementation(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          )
      );
      const job = platform.download(
        'staging/files/stalled.svg',
        expected,
        new AbortController().signal,
        false,
        () => {}
      );
      const rejected = (async () => {
        await expect(job).rejects.toMatchObject({
          code: 'unavailable',
          message: 'The coloring download timed out. Try again.',
        });
      })();
      await vi.advanceTimersByTimeAsync(LIBRARY_FILE_TIMEOUT_MS);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects cancellation and metered handoff before accepting another chunk', async () => {
    const abort = new AbortController();
    fixture.afterChunk = () => abort.abort();
    await expect(
      platform.download('staging/files/a.svg', expected, abort.signal, false, () => {})
    ).rejects.toMatchObject({ code: 'cancelled' });
    fixture.afterChunk = () => {
      fixture.metered = true;
    };
    await expect(
      platform.download(
        'staging/files/b.svg',
        expected,
        new AbortController().signal,
        false,
        () => {}
      )
    ).rejects.toMatchObject({ code: 'metered' });
    expect(await platform.read('staging/files/b.svg', 4)).toHaveLength(0);
  });
  it('rejects traversal and missing native support without a permission request', async () => {
    await expect(platform.write('../escape.json', bytes)).rejects.toMatchObject({
      code: 'unavailable',
    });
    fixture.bridge = null;
    await expect(platform.environment()).rejects.toMatchObject({ code: 'unavailable' });
  });
});

const candidate = new URL('../../experiments/native-architecture/', import.meta.url);
describe('native bridge registration and private storage contract', () => {
  it('registers both platform modules and pins their bounded hash limit to the manifest owner', async () => {
    const android = await readFile(
      new URL(
        'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryEnvironment.kt',
        candidate
      ),
      'utf8'
    );
    const ios = await readFile(
      new URL('ios/HelloWorld/SplotchLibraryEnvironment.swift', candidate),
      'utf8'
    );
    expect(Number(android.match(/MAX_FILE_BYTES = (\d+)/)[1])).toBe(MAX_PACK_FILE_BYTES);
    expect(Number(ios.match(/maxFileBytes = (\d+)/)[1])).toBe(MAX_PACK_FILE_BYTES);
    expect(android).toContain('context.filesDir');
    expect(ios).toContain('.applicationSupportDirectory');
    expect(ios).toContain('isExcludedFromBackup = true');
    expect(ios.match(/NWPathMonitor\(\)/g)).toHaveLength(1);
    expect(ios).toContain('monitor.pathUpdateHandler = { [weak self] path in');
    expect(ios).toContain('NSObject, RCTInvalidating');
    expect(ios).toContain('monitor.pathUpdateHandler = nil');
    expect(ios).toContain('if let directory = privateRoot { return directory }');
    expect(android).toContain('if (rootReady) return');
    const manifest = await readFile(
      new URL('android/app/src/main/AndroidManifest.xml', candidate),
      'utf8'
    );
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android.permission.ACCESS_NETWORK_STATE');
    const application = await readFile(
      new URL(
        'android/app/src/main/java/art/splotch/migration/probe/MainApplication.kt',
        candidate
      ),
      'utf8'
    );
    expect(application).toContain('SplotchLibraryPackage()');
    const xcode = await readFile(
      new URL('ios/HelloWorld.xcodeproj/project.pbxproj', candidate),
      'utf8'
    );
    expect(xcode.match(/SplotchLibraryEnvironment.swift in Sources/g)).toHaveLength(2);
    expect(xcode.match(/SplotchLibraryEnvironment.m in Sources/g)).toHaveLength(2);
  });
});
