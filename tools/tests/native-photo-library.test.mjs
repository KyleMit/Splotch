import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photos } from './native-photo-library-port.mjs';
import { photoLibrary } from '../../experiments/native-architecture/src/platform/photoLibrary.ts';
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

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

beforeEach(() => photos.reset());

describe('native photo library save', () => {
  it('asks for add-only access and creates the asset from the staged PNG bytes', async () => {
    expect(await photoLibrary.save(PNG)).toBe('photos');
    expect(photos.permissionRequests).toEqual([[true]]);
    expect(photos.created).toHaveLength(1);
    const [{ filePath, album, base64 }] = photos.created;
    expect(filePath).toMatch(/^cache\/splotch-photo-library-v1\/splotch-[\d_-]+\.png$/);
    expect(album).toBeUndefined();
    expect(base64).toBe(PNG);
    expect(photos.deleted).toEqual([filePath]);
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

  it('has no photo library on the web target', () => {
    expect(webPhotoLibrary).toBeNull();
  });
});

describe('shipping parity', () => {
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
