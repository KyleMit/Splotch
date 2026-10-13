import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photos } from './native-photo-library-port.mjs';
import {
  ANDROID_ALBUM_NAME,
  photoLibrary,
} from '../../experiments/native-architecture/src/platform/photoLibrary.ts';
import { photoLibrary as webPhotoLibrary } from '../../experiments/native-architecture/src/platform/photoLibrary.web.ts';
import {
  FAILED_DETAIL,
  PERMISSION_DETAIL,
  UNSAVED_HEADING,
  photoLibraryNotice,
} from '../../experiments/native-architecture/src/export/photoLibrary.ts';
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
    expect(filePath).toMatch(/^cache\/splotch-photo-library-v1\/splotch-[\d_-]+\.png$/);
    expect(album).toBeUndefined();
    expect(base64).toBe(PNG);
    expect(photos.deleted).toEqual([filePath]);
    expect(photos.files.size).toBe(0);
  });

  it('files an Android 11+ picture in the shipping Splotch album', async () => {
    photos.os = 'android';
    photos.androidApi = 30;
    expect(await photoLibrary.save(PNG)).toBe('photos');
    expect(photos.permissionRequests).toEqual([[true]]);
    expect(photos.created).toEqual([
      expect.objectContaining({ via: 'Album.create', album: 'Splotch', base64: PNG }),
    ]);
    expect(photos.files.size).toBe(0);
  });

  it('reports Android 10 and below as unavailable without asking or writing', async () => {
    photos.os = 'android';
    photos.androidApi = 29;
    expect(await photoLibrary.save(PNG)).toBe('unavailable');
    expect(photos.permissionRequests).toEqual([]);
    expect(photos.created).toEqual([]);
    expect(photos.files.size).toBe(0);
    expect(photoLibraryNotice('unavailable', 'android')).toBe(
      'Picture saved on this device. Saving to your gallery needs Android 11 or later.'
    );
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

  it('has no photo library on the web target', () => {
    expect(webPhotoLibrary).toBeNull();
  });
});

describe('shipping parity', () => {
  it('names the album the shipping Android PhotoLibraryPlugin saves into', () => {
    const plugin = read('android/app/src/main/java/art/splotch/app/PhotoLibraryPlugin.java');
    expect(plugin).toContain('Environment.DIRECTORY_PICTURES + File.separator + ALBUM_NAME');
    expect(plugin.match(/String ALBUM_NAME = "([^"]+)";/)?.[1]).toBe(ANDROID_ALBUM_NAME);
  });

  it.each(['ios', 'android'])('words %s unsaved pictures with the shipping banner copy', (os) => {
    const denied = saveFailureCopy('denied', 1, os);
    const failed = saveFailureCopy('failed', 1, os);
    expect(UNSAVED_HEADING).toBe(denied.heading);
    expect(PERMISSION_DETAIL[os]).toBe(denied.detail);
    expect(FAILED_DETAIL).toBe(failed.detail);
    expect(photoLibraryNotice('denied', os)).toContain(`${denied.detail} `);
    expect(photoLibraryNotice('failed', os)).toContain(`${failed.detail} `);
  });

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
