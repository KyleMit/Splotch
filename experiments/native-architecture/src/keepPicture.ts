import { Platform } from 'react-native';
import type { Drawing } from './drawing/model';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { pictureSave } from './platform/pictureSave';
import {
  pictureSaveFailure,
  pictureSaveNotice,
  type PictureSaveOutcome,
  type SaveFailure,
  type SaveOs,
} from './export/pictureSave';

// What a save tells the child: the notice always, and the failure the banner shows when the
// picture did not land.
export type KeptPicture = Readonly<{ notice: string; failure: SaveFailure | null }>;

function saveOs(): SaveOs {
  if (Platform.OS === 'web') return 'web';
  return Platform.OS === 'android' ? 'android' : 'ios';
}

async function capturedSave(
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<PictureSaveOutcome> {
  try {
    const pngBase64 = await surface?.capturePng(drawing);
    return pngBase64 ? await pictureSave.save(pngBase64) : 'failed';
  } catch {
    return 'failed';
  }
}

export function keptPicture(outcome: PictureSaveOutcome): KeptPicture {
  const os = saveOs();
  return { notice: pictureSaveNotice(outcome, os), failure: pictureSaveFailure(outcome, os) };
}

// The picture goes to the photo library on Android and iOS and downloads on the web; there is no
// copy kept inside the app, so a save that does not land leaves the picture on the paper alone.
export async function keepPicture(
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<KeptPicture> {
  return keptPicture(await capturedSave(drawing, surface));
}
