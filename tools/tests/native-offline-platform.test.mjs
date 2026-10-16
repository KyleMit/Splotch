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
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibraryPlatform } from '../../experiments/native-architecture/src/platform/offlineLibrary.ts';
import { catalogPack } from '../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import {
  createLibraryStore,
  packDirectory,
} from '../../experiments/native-architecture/src/offlineLibrary/store.ts';
import {
  MAX_PACK_FILE_BYTES,
  PACK_ORIGIN,
} from '../../experiments/native-architecture/src/offlineLibrary/manifest.ts';
import { LIBRARY_STORAGE_RESERVE_BYTES } from '../../experiments/native-architecture/src/offlineLibrary/contract.ts';

const fixture = vi.hoisted(() => ({
  root: '',
  rootCreates: 0,
  diskReads: 0,
  online: true,
  metered: false,
  bridge: null,
}));
vi.mock('react-native', () => ({
  NativeModules: {
    get SplotchLibraryEnvironment() {
      return fixture.bridge;
    },
  },
}));
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
  }
  return {
    Directory,
    File,
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
  fixture.bridge = {
    async environment() {
      return {
        rootUri: `file://${fixture.root}`,
        online: fixture.online,
        metered: fixture.metered,
      };
    },
    install: vi.fn(async () => true),
    cancelAll: vi.fn(async () => true),
    async verify(uri, length, sha256) {
      const data = await readFile(uri.replace(/^file:\/\//, ''));
      return data.length === length && createHash('sha256').update(data).digest('hex') === sha256;
    },
  };
  platform = createLibraryPlatform();
  await platform.environment();
});
afterEach(async () => {
  await rm(fixture.root, { recursive: true, force: true });
});

describe('actual native library adapter with whole-book transfer ownership', () => {
  it.each([false, true])(
    'hands the complete verified catalog snapshot and mobile-data policy %s to native',
    async (allowMetered) => {
      const pack = catalogPack('dinosaur', 'compact');
      const progress = vi.fn();
      await platform.installPack(pack, new AbortController().signal, allowMetered, progress);
      expect(fixture.bridge.install).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify(pack),
        JSON.stringify(pack.files),
        allowMetered
      );
      expect(progress).toHaveBeenCalledExactlyOnceWith(pack.bytes);
      expect(fixture.rootCreates).toBe(1);
      expect(fixture.diskReads).toBe(1);
      expect('download' in platform).toBe(false);
    }
  );

  it('awaits native cancellation before settling an aborted whole-book transfer', async () => {
    let rejectInstall;
    let finishCancel;
    let rejected = false;
    fixture.bridge.install.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectInstall = reject;
        })
    );
    fixture.bridge.cancelAll.mockImplementation(() => {
      rejectInstall(new Error('cancelled'));
      return new Promise((resolve) => {
        finishCancel = resolve;
      });
    });
    const abort = new AbortController();
    const installing = platform.installPack(
      catalogPack('dinosaur', 'full'),
      abort.signal,
      false,
      () => {}
    );
    const checked = installing.catch((error) => {
      rejected = true;
      return error;
    });
    abort.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.bridge.cancelAll).toHaveBeenCalledOnce();
    expect(rejected).toBe(false);
    finishCancel(true);
    expect(await checked).toMatchObject({ code: 'cancelled' });
  });

  it('rejects a pre-aborted transfer and a forged pack before native creates work', async () => {
    const abort = new AbortController();
    abort.abort();
    const pack = catalogPack('dinosaur', 'full');
    await expect(platform.installPack(pack, abort.signal, false, () => {})).rejects.toMatchObject({
      code: 'cancelled',
    });
    await expect(
      platform.installPack(
        { ...pack, bytes: pack.bytes + 1 },
        new AbortController().signal,
        false,
        () => {}
      )
    ).rejects.toThrow();
    expect(fixture.bridge.install).not.toHaveBeenCalled();
  });

  it('requires a verified native installed marker rather than trusting a bridge success', async () => {
    const store = createLibraryStore(platform);
    await expect(
      store.install(catalogPack('dinosaur', 'full'), new AbortController().signal, false, () => {})
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(await store.scan()).toEqual([]);
  });

  it('rejects a native success with one missing file and accepts the completed verified book', async () => {
    const pack = catalogPack('dinosaur', 'full');
    const directory = packDirectory(pack);
    const missing = pack.files.at(-1);
    const assetPath = (file) => `${directory}/files/${file.path.split('/').at(-1)}`;
    const assetBytes = (file) =>
      readFile(new URL(`../../web/static${file.downloadPath}`, import.meta.url));
    for (const file of pack.files.slice(0, -1))
      await platform.write(assetPath(file), await assetBytes(file));
    await platform.write(
      `${directory}/identity.json`,
      new TextEncoder().encode(JSON.stringify(pack.files))
    );
    await platform.write(
      `${directory}/installed.json`,
      new TextEncoder().encode(JSON.stringify(pack))
    );
    const store = createLibraryStore(platform);
    await expect(
      store.install(pack, new AbortController().signal, false, () => {})
    ).rejects.toMatchObject({ code: 'corrupt' });
    expect(fixture.bridge.install).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(pack),
      JSON.stringify(pack.files),
      false
    );
    expect(await store.scan()).toEqual([]);
    await platform.write(assetPath(missing), await assetBytes(missing));
    await expect(
      store.install(pack, new AbortController().signal, false, () => {})
    ).resolves.toEqual(pack);
    expect(await store.scan()).toEqual([pack]);
  });

  it.each([
    ['library_metered', 'metered'],
    ['library_storage_full', 'storage-full'],
  ])('reports native %s as the existing %s disposition', async (code, expectedCode) => {
    fixture.bridge.install.mockRejectedValueOnce({ code });
    await expect(
      platform.installPack(
        catalogPack('dinosaur', 'full'),
        new AbortController().signal,
        false,
        () => {}
      )
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it('confirms native cancellation before removal can delete stored books', async () => {
    fixture.bridge.cancelAll.mockResolvedValueOnce(false);
    await expect(platform.cancelInstallations()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('retains bounded private reads, native hashes and awaited publication moves', async () => {
    await platform.write('staging/files/trex.svg', bytes);
    expect(await platform.verify('staging/files/trex.svg', expected)).toBe(true);
    await platform.move('staging/files/trex.svg', 'installed/files/trex.svg');
    expect([...(await platform.read('installed/files/trex.svg', 4))]).toEqual([...bytes]);
    await expect(platform.read('installed/files/trex.svg', 3)).rejects.toMatchObject({
      code: 'corrupt',
    });
  });

  it('rejects traversal and missing native background support without a permission request', async () => {
    await expect(platform.write('../escape.json', bytes)).rejects.toMatchObject({
      code: 'unavailable',
    });
    fixture.bridge = { environment: fixture.bridge.environment, verify: fixture.bridge.verify };
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
    const androidFiles = await readFile(
      new URL(
        'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryFiles.kt',
        candidate
      ),
      'utf8'
    );
    const iosFiles = await readFile(
      new URL('ios/HelloWorld/SplotchLibraryFiles.swift', candidate),
      'utf8'
    );
    expect(Number(androidFiles.match(/MAX_FILE_BYTES = (\d+)/)[1])).toBe(MAX_PACK_FILE_BYTES);
    expect(Number(iosFiles.match(/maxFileBytes: Int64 = (\d+)/)[1])).toBe(MAX_PACK_FILE_BYTES);
    const packSource = await readFile(new URL('src/offlineLibrary/manifest.ts', candidate), 'utf8');
    const fileCount = Number(packSource.match(/PACK_FILE_COUNT = (\d+)/)[1]);
    expect(Number(androidFiles.match(/PACK_FILE_COUNT = (\d+)/)[1])).toBe(fileCount);
    expect(Number(iosFiles.match(/packFileCount = (\d+)/)[1])).toBe(fileCount);
    const packLimit =
      Number(packSource.match(/MAX_PACK_BYTES = (\d+) \* 1024 \* 1024/)[1]) * 1024 * 1024;
    expect(Number(androidFiles.match(/MAX_PACK_BYTES = (\d+)/)[1])).toBe(packLimit);
    expect(Number(iosFiles.match(/maxPackBytes: Int64 = (\d+)/)[1])).toBe(packLimit);
    expect(androidFiles.match(/"(splotch-offline-library-v\d+)"/)[1]).toBe(
      iosFiles.match(/"(splotch-offline-library-v\d+)"/)[1]
    );
    const objc = await readFile(
      new URL('ios/HelloWorld/SplotchLibraryEnvironment.m', candidate),
      'utf8'
    );
    expect(objc).toContain(
      'RCT_EXTERN_METHOD(install:(NSString *)marker identity:(NSString *)identity allowMetered:(BOOL)allowMetered'
    );
    expect(objc).toContain('RCT_EXTERN_METHOD(cancelAll:(RCTPromiseResolveBlock)resolve');
    expect(android).toContain(
      'fun install(marker: String, identity: String, allowMetered: Boolean, promise: Promise)'
    );
    expect(android).toContain('fun cancelAll(promise: Promise)');

    expect(androidFiles).toContain('context.filesDir');
    expect(iosFiles).toContain('.applicationSupportDirectory');
    expect(iosFiles).toContain('isExcludedFromBackup = true');
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
    expect(xcode.match(/SplotchLibraryFiles.swift in Sources/g)).toHaveLength(2);
    expect(xcode.match(/SplotchLibraryDownloads.swift in Sources/g)).toHaveLength(2);
  });
});

it('preserves shipping native network and background transfer policy', async () => {
  const android = await readFile(
    new URL(
      'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryDownloads.kt',
      candidate
    ),
    'utf8'
  );
  const worker = await readFile(
    new URL(
      'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryWorker.kt',
      candidate
    ),
    'utf8'
  );
  const ios = await readFile(
    new URL('ios/HelloWorld/SplotchLibraryDownloads.swift', candidate),
    'utf8'
  );
  const delegate = await readFile(new URL('ios/HelloWorld/AppDelegate.swift', candidate), 'utf8');
  const shippingAndroid = await readFile(
    new URL('../../android/app/build.gradle', import.meta.url),
    'utf8'
  );
  const nativeAndroid = await readFile(new URL('android/app/build.gradle', candidate), 'utf8');
  expect(nativeAndroid.match(/androidx.work:work-runtime:([\d.]+)/)[1]).toBe(
    shippingAndroid.match(/androidx.work:work-runtime:([\d.]+)/)[1]
  );
  expect(android).toContain('if (allowMetered) NetworkType.CONNECTED else NetworkType.UNMETERED');
  expect(android).toContain('getWorkInfosForUniqueWork(WORK_TAG)');
  expect(android).toContain('enqueueUniqueWork(WORK_TAG, ExistingWorkPolicy.REPLACE, work)');
  const origins = (source) => new Set(source.match(/https:\/\/[a-z0-9.-]+/g) ?? []);
  expect(origins(worker)).toEqual(new Set([PACK_ORIGIN]));
  expect(origins(ios)).toEqual(new Set([PACK_ORIGIN]));
  expect(worker).toContain('stored.getBoolean("allowMetered") && dataSaverEnabled()');
  expect(worker).toContain('SplotchLibraryFiles.write(File(staging, "installed.json"), marker)');
  expect(worker).toContain('staging.renameTo(current)');
  expect(worker).toContain('prepareStaging(pack, current, staging, job, token)');
  expect(worker).toContain(
    'if (candidate == current) previous.copyTo(destination, overwrite = true)'
  );
  expect(worker).toContain('check(previous.renameTo(destination))');
  expect(worker).toContain('directory != packStages');
  expect(worker).toContain('for (directory in siblings) check(directory.deleteRecursively())');
  expect(Number(worker.match(/STORAGE_RESERVE_BYTES = (\d+)L/)[1])).toBe(
    LIBRARY_STORAGE_RESERVE_BYTES
  );
  expect(ios).toContain('URLSessionConfiguration.background');
  expect(ios).toContain('configuration.isDiscretionary = true');
  expect(ios).toContain('configuration.allowsExpensiveNetworkAccess = allowMetered');
  expect(ios).toContain('configuration.allowsConstrainedNetworkAccess = false');
  expect(Number(ios.match(/storageReserveBytes: Int64 = (\d+)/)[1])).toBe(
    LIBRARY_STORAGE_RESERVE_BYTES
  );
  expect(delegate).toContain('SplotchLibraryDownloads.shared.resumePendingDownload()');
  expect(delegate).toContain('handleEventsForBackgroundURLSession identifier');
  expect(delegate).toContain('SplotchLibraryDownloads.shared.acceptBackgroundEvents');
});

it('pins native pack validation to the JavaScript catalog limits', async () => {
  const [manifest, android, ios] = await Promise.all([
    readFile(new URL('src/offlineLibrary/manifest.ts', candidate), 'utf8'),
    readFile(
      new URL(
        'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryFiles.kt',
        candidate
      ),
      'utf8'
    ),
    readFile(new URL('ios/HelloWorld/SplotchLibraryFiles.swift', candidate), 'utf8'),
  ]);
  const fileCount = Number(manifest.match(/const PACK_FILE_COUNT = (\d+);/)[1]);
  const maxPackBytes =
    Number(manifest.match(/const MAX_PACK_BYTES = (\d+) \* 1024 \* 1024;/)[1]) * 1024 * 1024;
  expect(Number(android.match(/PACK_FILE_COUNT = (\d+)/)[1])).toBe(fileCount);
  expect(Number(ios.match(/packFileCount = (\d+)/)[1])).toBe(fileCount);
  expect(Number(android.match(/MAX_FILE_BYTES = (\d+)L/)[1])).toBe(MAX_PACK_FILE_BYTES);
  expect(Number(ios.match(/maxFileBytes: Int64 = (\d+)/)[1])).toBe(MAX_PACK_FILE_BYTES);
  expect(Number(android.match(/MAX_PACK_BYTES = (\d+)L/)[1])).toBe(maxPackBytes);
  expect(Number(ios.match(/maxPackBytes: Int64 = (\d+)/)[1])).toBe(maxPackBytes);
});

it('ignores an existing Android backoff while observing failure of a joined running attempt', async () => {
  const source = await readFile(
    new URL(
      'android/app/src/main/java/art/splotch/migration/probe/SplotchLibraryDownloads.kt',
      candidate
    ),
    'utf8'
  );
  const shipping = await readFile(
    new URL(
      '../../android/app/src/main/java/art/splotch/app/ColoringPacksPlugin.java',
      import.meta.url
    ),
    'utf8'
  );
  expect(shipping).toContain('ExistingWorkPolicy.REPLACE');
  expect(source).toContain(
    'val joinedAttemptCount = if (joins && existing?.state == WorkInfo.State.ENQUEUED) requireNotNull(existing).runAttemptCount else 0'
  );
  expect(source).not.toContain('if (joins) requireNotNull(existing).runAttemptCount');
  expect(source).toContain('info.runAttemptCount > joinedAttemptCount');
  expect(source).toContain('if (!finished && !deferred) return@Observer');
  expect(source).toContain('if (info.state == WorkInfo.State.SUCCEEDED) promise.resolve(true)');
});

it('prunes only superseded same-book iOS transfer stages and retains published Undo files', async () => {
  const source = await readFile(
    new URL('ios/HelloWorld/SplotchLibraryFiles.swift', candidate),
    'utf8'
  );
  const downloads = await readFile(
    new URL('ios/HelloWorld/SplotchLibraryDownloads.swift', candidate),
    'utf8'
  );
  const shipping = await readFile(
    new URL('../../ios/App/App/ColoringPacksPlugin.swift', import.meta.url),
    'utf8'
  );
  expect(shipping).toContain('try Self.removeUnlistedFiles(in: directory, book: book)');
  expect(source).toContain('let staging = try stage(pack)');
  expect(source).toContain('let transfers = staging.deletingLastPathComponent()');
  expect(source).toContain('contentsOfDirectory(at: transfers, includingPropertiesForKeys: nil)');
  expect(source).toContain(
    'where sibling.lastPathComponent.hasPrefix(pack.id + "-") && sibling.lastPathComponent != staging.lastPathComponent'
  );
  expect(source).toContain('try FileManager.default.removeItem(at: sibling)');
  expect(downloads.match(/try SplotchLibraryFiles.pruneSupersededStages\(pack\)/g)).toHaveLength(2);
});
