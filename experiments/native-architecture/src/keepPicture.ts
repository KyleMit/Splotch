import { Platform } from 'react-native';
import type { Drawing } from './drawing/model';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { pictureSave } from './platform/pictureSave';
import type { PictureSaveOutcome, SaveOs } from './export/pictureSave';
import type { PictureFormat } from './export/pictureFilename';

// What a save did with the picture, and the PNG it captured: the bytes Try again saves when the
// save did not land.
export type KeptPicture = Readonly<{ outcome: PictureSaveOutcome; pngBase64: string | null }>;

export function saveOs(): SaveOs {
  if (Platform.OS === 'web') return 'web';
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export async function capturePicture(
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<string | null> {
  try {
    return (await surface?.capturePng(drawing)) || null;
  } catch {
    return null;
  }
}

export async function savePicture(
  pngBase64: string,
  format?: PictureFormat
): Promise<PictureSaveOutcome> {
  try {
    return await pictureSave.save(pngBase64, format);
  } catch {
    return 'failed';
  }
}

// The picture goes to the photo library on Android and iOS and downloads on the web; there is no
// copy kept inside the app, so a save that does not land leaves the picture on the paper and in
// the Save Failure Banner's Try again.
export async function keepPicture(
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<KeptPicture> {
  const pngBase64 = await capturePicture(drawing, surface);
  return { outcome: pngBase64 ? await savePicture(pngBase64) : 'failed', pngBase64 };
}
