import type { PhotoLibrary, PhotoLibraryOutcome } from '../export/photoLibrary';

const STAGING_DIRECTORY = 'splotch-photo-library-v1';

function timestamp(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Asks only for add-only access: iOS shows its "add to Photos" prompt, and on Android a
// write-only request with no storage permission in the manifest asks nothing, because
// MediaStore inserts need none on API 30+. Asset.create, not the legacy createAssetAsync:
// the legacy call demands WRITE_EXTERNAL_STORAGE below Android 13 and, under iOS add-only
// access, rejects after saving because it reads the new asset back.
async function save(pngBase64: string): Promise<PhotoLibraryOutcome> {
  const MediaLibrary = await import('expo-media-library');
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';
  const { Directory, File, Paths } = await import('expo-file-system');
  const LegacyFiles = await import('expo-file-system/legacy');
  const owner = new Directory(Paths.cache, STAGING_DIRECTORY);
  owner.create({ intermediates: true, idempotent: true });
  const staged = new File(owner, `splotch-${timestamp(new Date())}.png`);
  try {
    await LegacyFiles.writeAsStringAsync(staged.uri, pngBase64, {
      encoding: LegacyFiles.EncodingType.Base64,
    });
    await MediaLibrary.Asset.create(staged.uri);
    return 'photos';
  } finally {
    try {
      if (staged.exists) staged.delete();
    } catch {
      // A leftover cache file must not turn a landed save into a failure.
    }
  }
}

export const photoLibrary: PhotoLibrary | null = {
  async save(pngBase64) {
    try {
      return await save(pngBase64);
    } catch {
      return 'failed';
    }
  },
};
