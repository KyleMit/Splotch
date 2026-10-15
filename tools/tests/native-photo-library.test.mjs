import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photos } from './native-photo-library-port.mjs';
import {
  ANDROID_ALBUM_NAME,
  photoLibrary,
} from '../../experiments/native-architecture/src/platform/photoLibrary.ts';
import { pictureSave as nativePictureSave } from '../../experiments/native-architecture/src/platform/pictureSave.ts';
import {
  UNAVAILABLE_DETAIL,
  saveFailureCopy as nativeSaveFailureCopy,
} from '../../experiments/native-architecture/src/export/pictureSave.ts';
import {
  DEFAULT_SAVE_ON_DELETE_ENABLED,
  SAVE_ON_DELETE_HELP,
  SAVE_ON_DELETE_LABEL,
} from '../../experiments/native-architecture/src/settings/saveOnDelete.ts';
import { saveFailureCopy } from '../../web/src/lib/drawing/saveFailureCopy.ts';

vi.mock('expo-media-library', () =>
  import('./native-photo-library-port.mjs').then((port) => port.mediaLibraryModule)
);
vi.mock('expo-file-system', () =>
  import('./native-photo-library-port.mjs').then((port) => port.fileSystemModule)
);
vi.mock('expo-file-system/legacy', () =>
  import('./native-photo-library-port.mjs').then((port) => port.legacyFilesModule)
);
vi.mock('react-native', () =>
  import('./native-photo-library-port.mjs').then((port) => port.reactNativeModule)
);

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

beforeEach(() => photos.reset());

describe('native photo library save', () => {
  it('asks iOS for add-only access and adds the staged PNG bytes to the camera roll', async () => {
    expect(await photoLibrary.save(PNG)).toBe('photos');
    expect(photos.permissionRequests).toEqual([[true]]);
    expect(photos.created).toHaveLength(1);
    const [{ via, filePath, album, base64 }] = photos.created;
    expect(via).toBe('Asset.create');
    expect(filePath).toMatch(/^cache\/splotch-photo-library-v1\/[\da-z_-]+\.png$/);
    expect(album).toBeUndefined();
    expect(base64).toBe(PNG);
    expect(photos.deleted).toEqual([filePath]);
    expect(photos.files.size).toBe(0);
  });

  it.each([24, 28, 29, 30, 35])(
    'files an Android API%s picture through the shipping-compatible gallery writer',
    async (api) => {
      photos.os = 'android';
      photos.androidApi = api;
      expect(await photoLibrary.save(PNG)).toBe('photos');
      expect(photos.permissionRequests).toEqual([]);
      expect(photos.created).toEqual([
        expect.objectContaining({
          via: 'SplotchPhotoLibrary.save',
          album: 'Splotch',
          base64: PNG,
          mime: 'image/png',
          displayName: expect.stringMatching(/^splotch-.*\.png$/),
        }),
      ]);
      expect(photos.files.size).toBe(0);
    }
  );

  it('reports a missing native gallery writer without losing a staged picture', async () => {
    photos.os = 'android';
    photos.nativeAvailable = false;
    expect(await photoLibrary.save(PNG)).toBe('unavailable');
    expect(photos.permissionRequests).toEqual([]);
    expect(photos.created).toEqual([]);
    expect(photos.files.size).toBe(0);
    expect(nativeSaveFailureCopy('unavailable', 0, 'android')).toEqual({
      heading: saveFailureCopy('failed', 0, 'android').heading,
      detail: UNAVAILABLE_DETAIL,
    });
  });

  it.each(['denied', 'failed'])(
    'retains the native Android %s outcome and removes staging',
    async (outcome) => {
      photos.os = 'android';
      photos.nativeOutcome = outcome;
      expect(await photoLibrary.save(PNG)).toBe(outcome);
      expect(photos.created).toHaveLength(1);
      expect(photos.files.size).toBe(0);
    }
  );

  it('rejects an unrecognized native gallery outcome and removes staging', async () => {
    photos.os = 'android';
    photos.nativeOutcome = 'saved-maybe';
    expect(await photoLibrary.save(PNG)).toBe('failed');
    expect(photos.files.size).toBe(0);
  });

  it('keeps concurrent same-second Android saves in distinct staging files', async () => {
    photos.os = 'android';
    const reads = [];
    photos.beforeNativeRead = () => new Promise((resolve) => reads.push(resolve));
    const first = photoLibrary.save(PNG);
    const secondBytes = btoa('second picture');
    const second = photoLibrary.save(secondBytes);
    await vi.waitFor(() => expect(reads).toHaveLength(2));
    expect(photos.files.size).toBe(2);
    for (const read of reads) read();
    expect(await Promise.all([first, second])).toEqual(['photos', 'photos']);
    expect(photos.created.map(({ base64 }) => base64)).toEqual([PNG, secondBytes]);
    expect(new Set(photos.created.map(({ filePath }) => filePath)).size).toBe(2);
    expect(photos.files.size).toBe(0);
  });

  it('reports a refused permission as denied without writing anything', async () => {
    photos.permission = 'denied';
    expect(await photoLibrary.save(PNG)).toBe('denied');
    expect(photos.created).toEqual([]);
    expect(photos.files.size).toBe(0);
  });

  it('reports a rejected asset as failed and still removes the staged file', async () => {
    photos.createError = new Error('MediaStore insert failed');
    expect(await photoLibrary.save(PNG)).toBe('failed');
    expect(photos.created).toHaveLength(1);
    expect(photos.files.size).toBe(0);
  });

  it('keeps native pictures in the photo library', () => {
    expect(nativePictureSave).toBe(photoLibrary);
  });
});

describe('shipping parity', () => {
  it('names the album the shipping Android PhotoLibraryPlugin saves into', () => {
    const plugin = read('android/app/src/main/java/art/splotch/app/PhotoLibraryPlugin.java');
    expect(plugin).toContain('Environment.DIRECTORY_PICTURES + File.separator + ALBUM_NAME');
    expect(plugin.match(/String ALBUM_NAME = "([^"]+)";/)?.[1]).toBe(ANDROID_ALBUM_NAME);
    const native = read(
      'experiments/native-architecture/android/app/src/main/java/art/splotch/migration/probe/SplotchPhotoLibrary.kt'
    );
    expect(native.match(/const val ALBUM_NAME = "([^"]+)"/)?.[1]).toBe(ANDROID_ALBUM_NAME);
    const stagedDirectory = read(
      'experiments/native-architecture/src/platform/photoLibrary.ts'
    ).match(/const STAGING_DIRECTORY = '([^']+)'/)?.[1];
    expect(native.match(/const val STAGING_DIRECTORY = "([^"]+)"/)?.[1]).toBe(stagedDirectory);
    expect(native).toContain('Environment.DIRECTORY_PICTURES + File.separator + ALBUM_NAME');
    expect(native).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q');
    expect(native).toContain('MediaStore.MediaColumns.IS_PENDING, 1');
    expect(native).toContain('MediaStore.MediaColumns.IS_PENDING, 0');
    expect(native).toContain('resolver.delete(item, null, null)');
    expect(native).toContain('context.externalMediaDirs.firstOrNull()');
    expect(plugin).toContain('getContext().getExternalMediaDirs()');
  });

  // Every outcome shipping words, for no held picture, one, several and the held limit, on each
  // platform the native app runs on.
  it.each(['ios', 'android', 'web'])(
    'words %s unsaved pictures with the shipping banner copy',
    (os) => {
      for (const outcome of ['denied', 'failed'])
        for (const count of [0, 1, 2, 8])
          expect(nativeSaveFailureCopy(outcome, count, os)).toEqual(
            saveFailureCopy(outcome, count, os)
          );
    }
  );

  it('ports the Auto-Save on Delete label, help, and default', () => {
    const section = read('web/src/lib/components/settings/SavingSection.svelte');
    const row = section.match(/<ToggleRow\b[^>]*id="saveOnDeleteToggle"[^>]*\/>/)?.[0];
    expect(row).toContain(`label="${SAVE_ON_DELETE_LABEL}"`);
    expect(row).toContain(`help="${SAVE_ON_DELETE_HELP}"`);
    const defaults = read('web/src/lib/state/settings.svelte.ts');
    expect(defaults).toContain(
      `saveOnDeleteEnabled: [STORAGE_KEYS.saveOnDelete, ${DEFAULT_SAVE_ON_DELETE_ENABLED}]`
    );
  });

  it('asks iOS for add-only access with the shipping purpose string and never for read access', () => {
    const usage = (plist) =>
      plist.match(/<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>([^<]*)<\/string>/)?.[1];
    const candidate = read('experiments/native-architecture/ios/HelloWorld/Info.plist');
    expect(usage(candidate)).toBeDefined();
    expect(usage(candidate)).toBe(usage(read('ios/App/App/Info.plist')));
    expect(candidate).not.toContain('NSPhotoLibraryUsageDescription');
  });
});
