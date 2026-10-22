import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photos } from './native-photo-library-port.mjs';
import { ANDROID_ALBUM_NAME, photoLibrary } from '../../src/platform/photoLibrary.ts';
import { pictureSave as nativePictureSave } from '../../src/platform/pictureSave.ts';
import { saveFailureCopy } from '../../src/export/pictureSave.ts';
import { createSaveFailure } from '../../src/export/saveFailure.ts';

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
    const failure = createSaveFailure(photoLibrary.save, vi.fn());
    failure.report(await photoLibrary.save(PNG), PNG);
    expect(failure.getState()).toEqual({ outcome: 'failed', pictureCount: 1, retrying: false });
    expect(photos.permissionRequests).toEqual([]);
    expect(photos.created).toEqual([]);
    expect(photos.files.size).toBe(0);
    photos.nativeAvailable = true;
    await failure.retry();
    expect(photos.created).toEqual([expect.objectContaining({ base64: PNG })]);
    expect(failure.getState().outcome).toBeNull();
  });

  it.each(['denied', 'failed'])(
    'retains the native Android %s outcome and removes staging',
    async (outcome) => {
      photos.os = 'android';
      photos.nativeOutcome = outcome;
      expect(await photoLibrary.save(PNG)).toBe(outcome);
      expect(photos.nativeCalls).toHaveLength(1);
      expect(photos.created).toEqual([]);
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
  it('names the album the Android gallery writer saves into', () => {
    const native = read('android/app/src/main/java/art/splotch/app/SplotchPhotoLibrary.kt');
    expect(native.match(/const val ALBUM_NAME = "([^"]+)"/)?.[1]).toBe(ANDROID_ALBUM_NAME);
    const stagedDirectory = read('src/platform/photoLibrary.ts').match(
      /const STAGING_DIRECTORY = '([^']+)'/
    )?.[1];
    expect(native.match(/const val STAGING_DIRECTORY = "([^"]+)"/)?.[1]).toBe(stagedDirectory);
    expect(native).toContain('Environment.DIRECTORY_PICTURES + File.separator + ALBUM_NAME');
    expect(native).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q');
    expect(native).toContain('MediaStore.MediaColumns.IS_PENDING, 1');
    expect(native).toContain('MediaStore.MediaColumns.IS_PENDING, 0');
    expect(native).toContain('resolver.delete(item, null, null)');
    expect(native).toContain('context.externalMediaDirs.firstOrNull()');
  });

  it('asks iOS for add-only access and never for read access', () => {
    const usage = (plist) =>
      plist.match(/<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>([^<]*)<\/string>/)?.[1];
    const candidate = read('ios/Splotch/Info.plist');
    expect(usage(candidate)).toBeDefined();
    expect(candidate).not.toContain('NSPhotoLibraryUsageDescription');
  });
});

const UNSAVED_COUNTS = [
  [0, "Your picture wasn't saved", 'Something went wrong while saving it.'],
  [1, "Your picture wasn't saved", 'Something went wrong while saving. Try again in a moment.'],
  [2, "2 pictures weren't saved", 'Something went wrong while saving. Try again in a moment.'],
  [8, "8 pictures weren't saved", 'Something went wrong while saving. Try again in a moment.'],
];
const UNSAVED_OUTCOMES = [
  [
    'ios',
    'denied',
    'Splotch needs permission to add pictures to Photos. Turn it on in Settings, then try again.',
  ],
  [
    'android',
    'denied',
    'Splotch needs storage permission to save to your gallery. Turn it on in Settings, then try again.',
  ],
  ['web', 'denied', null],
  ['ios', 'failed', null],
  ['android', 'failed', null],
  ['web', 'failed', null],
];
it.each(
  UNSAVED_OUTCOMES.flatMap(([os, outcome, permissionDetail]) =>
    UNSAVED_COUNTS.map(([count, heading, failureDetail]) => ({
      os,
      outcome,
      count,
      expected: { heading, detail: permissionDetail ?? failureDetail },
    }))
  )
)('words $count unsaved pictures after $outcome on $os', ({ os, outcome, count, expected }) => {
  expect(saveFailureCopy(outcome, count, os)).toEqual(expected);
});
