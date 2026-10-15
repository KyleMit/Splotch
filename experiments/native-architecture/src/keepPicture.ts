import { Platform } from 'react-native';
import type { Drawing } from './drawing/model';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { pictureSave } from './platform/pictureSave';
import type { PictureSaveOutcome, SaveOs } from './export/pictureSave';
import type { PictureFormat } from './export/pictureFilename';

export function saveOs(): SaveOs {
  if (Platform.OS === 'web') return 'web';
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export async function capturePicture(
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<string | null> {
  try {
    return (await surface?.exportPng(drawing)) || null;
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
