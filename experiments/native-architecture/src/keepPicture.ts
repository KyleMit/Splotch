import { Platform } from 'react-native';
import type { Drawing } from './drawing/model';
import type { DrawingSurfaceHandle, ExportedPaper } from './drawing/DrawingSurface';
import { pictureSave } from './platform/pictureSave';
import {
  isUnsaved,
  type PictureSaveOutcome,
  type PictureSaveOptions,
  type SaveOs,
  type UnsavedOutcome,
} from './export/pictureSave';
import type { PictureFormat } from './export/pictureFilename';

export function saveOs(): SaveOs {
  if (Platform.OS === 'web') return 'web';
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export async function capturePicture(
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<ExportedPaper | null> {
  try {
    return (await surface?.exportPng(drawing)) ?? null;
  } catch {
    return null;
  }
}

export async function savePicture(
  pngBase64: string,
  format?: PictureFormat,
  options?: PictureSaveOptions
): Promise<PictureSaveOutcome> {
  try {
    return await pictureSave.save(pngBase64, format, options);
  } catch {
    return 'failed';
  }
}

export function saveClearedPicture(
  pngBase64: string | null,
  reportFailure: (outcome: UnsavedOutcome, pngBase64: string | null) => void
) {
  if (!pngBase64) {
    reportFailure('failed', null);
    return;
  }
  void savePicture(pngBase64).then((outcome) => {
    if (isUnsaved(outcome)) reportFailure(outcome, pngBase64);
  });
}
