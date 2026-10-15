import { NativeModules, Platform } from 'react-native';
import type { PictureSave, PictureSaveOutcome } from '../export/pictureSave';
import { DRAWING_PICTURE, pictureFilename, type PictureFormat } from '../export/pictureFilename';
import { createLazyExport } from '../lazyExport';

const fileModules = createLazyExport(async () => {
  const [files, legacy] = await Promise.all([
    import('expo-file-system'),
    import('expo-file-system/legacy'),
  ]);
  return { files, legacy };
});
const mediaModule = createLazyExport(() => import('expo-media-library'));

const STAGING_DIRECTORY = 'splotch-photo-library-v1';
// The shipping app's Android album, PhotoLibraryPlugin.java's ALBUM_NAME;
// tools/tests/native-photo-library.test.mjs holds the native writers equal.
export const ANDROID_ALBUM_NAME = 'Splotch';
type AndroidPhotoLibrary = {
  save(
    uri: string,
    displayName: string,
    mime: PictureFormat['mime'],
    album: string
  ): Promise<unknown>;
};

function isAndroidPhotoLibrary(value: unknown): value is AndroidPhotoLibrary {
  return (
    value !== null &&
    typeof value === 'object' &&
    'save' in value &&
    typeof value.save === 'function'
  );
}

// Asset.create honors iOS add-only access; the legacy Expo call reads the saved asset back and
// rejects after saving. Android's writer owns shipping's older-OS permission and fallback policy.
async function save(base64: string, format: PictureFormat): Promise<PictureSaveOutcome> {
  const android = Platform.OS === 'android';
  const native: unknown = NativeModules?.SplotchPhotoLibrary;
  if (android && !isAndroidPhotoLibrary(native)) return 'unavailable';
  const MediaLibrary = android ? null : await mediaModule.load();
  if (MediaLibrary) {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return 'denied';
  }
  const {
    files: { Directory, File, Paths },
    legacy: LegacyFiles,
  } = await fileModules.load();
  const owner = new Directory(Paths.cache, STAGING_DIRECTORY);
  owner.create({ intermediates: true, idempotent: true });
  const displayName = pictureFilename(new Date(), format);
  const staged = new File(
    owner,
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${displayName}`
  );
  try {
    await LegacyFiles.writeAsStringAsync(staged.uri, base64, {
      encoding: LegacyFiles.EncodingType.Base64,
    });
    if (isAndroidPhotoLibrary(native) && android) {
      const outcome = await native.save(staged.uri, displayName, format.mime, ANDROID_ALBUM_NAME);
      if (outcome === 'photos' || outcome === 'denied' || outcome === 'failed') return outcome;
      throw new Error('The photo library returned an invalid outcome.');
    }
    if (!MediaLibrary) throw new Error('The photo library is unavailable.');
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

export const photoLibrary: PictureSave = {
  async save(base64, format = DRAWING_PICTURE) {
    try {
      return await save(base64, format);
    } catch {
      return 'failed';
    }
  },
};
