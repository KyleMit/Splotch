import { Platform } from 'react-native';
import type { PictureSave, PictureSaveOutcome } from '../export/pictureSave';
import { pictureFilename } from '../export/pictureFilename';

const STAGING_DIRECTORY = 'splotch-photo-library-v1';
// The shipping app's Android album, PhotoLibraryPlugin.java's ALBUM_NAME; Album.create files
// the picture under Pictures/<name>/. tools/tests/native-photo-library.test.mjs holds them equal.
export const ANDROID_ALBUM_NAME = 'Splotch';
// Android 11. Below it expo-media-library writes through WRITE_EXTERNAL_STORAGE, which this
// app's manifest removes, so the save could never land.
const MEDIASTORE_WITHOUT_PERMISSION_API = 30;

// Asks only for add-only access: iOS shows its "add to Photos" prompt, and on Android a
// write-only request with no storage permission in the manifest asks nothing, because
// MediaStore inserts need none on API 30+. Asset.create, not the legacy createAssetAsync:
// the legacy call demands WRITE_EXTERNAL_STORAGE below Android 13 and, under iOS add-only
// access, rejects after saving because it reads the new asset back. Android files the picture
// through Album.create, which inserts it under the album's relative path and finds the album
// among the app's own MediaStore rows; on iOS that call needs full library access, so iOS
// keeps the default camera roll save.
async function save(pngBase64: string): Promise<PictureSaveOutcome> {
  if (Platform.OS === 'android' && Number(Platform.Version) < MEDIASTORE_WITHOUT_PERMISSION_API)
    return 'unavailable';
  const MediaLibrary = await import('expo-media-library');
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';
  const { Directory, File, Paths } = await import('expo-file-system');
  const LegacyFiles = await import('expo-file-system/legacy');
  const owner = new Directory(Paths.cache, STAGING_DIRECTORY);
  owner.create({ intermediates: true, idempotent: true });
  const staged = new File(owner, pictureFilename(new Date()));
  try {
    await LegacyFiles.writeAsStringAsync(staged.uri, pngBase64, {
      encoding: LegacyFiles.EncodingType.Base64,
    });
    if (Platform.OS === 'android')
      await MediaLibrary.Album.create(ANDROID_ALBUM_NAME, [staged.uri]);
    else await MediaLibrary.Asset.create(staged.uri);
    return 'photos';
  } finally {
    try {
      if (staged.exists) staged.delete();
    } catch {
      // A leftover cache file must not turn a landed save into a failure.
    }
  }
}

export const photoLibrary: PictureSave = {
  async save(pngBase64) {
    try {
      return await save(pngBase64);
    } catch {
      return 'failed';
    }
  },
};
