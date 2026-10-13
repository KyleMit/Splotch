import { Platform } from 'react-native';
import type { Drawing } from './drawing/model';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { savePicture } from './platform/drawingFiles';
import { photoLibrary } from './platform/photoLibrary';
import {
  IN_APP_SAVED_NOTICE,
  photoLibraryFailure,
  photoLibraryNotice,
  type PhotoLibrary,
  type PhotoLibraryOutcome,
  type SaveFailure,
} from './export/photoLibrary';

// What a save tells the child: the notice always, and the failure the banner shows when the
// photo library refused its copy.
export type KeptPicture = Readonly<{ notice: string; failure: SaveFailure | null }>;

async function saveToPhotoLibrary(
  library: PhotoLibrary,
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<PhotoLibraryOutcome> {
  try {
    const pngBase64 = await surface?.capturePng(drawing);
    return pngBase64 ? await library.save(pngBase64) : 'failed';
  } catch {
    return 'failed';
  }
}

// The in-app copy is written first and its failure stops the save, as it always has; the
// photo library copy follows wherever one exists, and its failure only changes the notice,
// because the in-app copy already holds the picture.
export async function keepPicture(
  drawing: Drawing,
  surface: DrawingSurfaceHandle | null
): Promise<KeptPicture> {
  await savePicture(drawing);
  if (!photoLibrary) return { notice: IN_APP_SAVED_NOTICE, failure: null };
  const outcome = await saveToPhotoLibrary(photoLibrary, drawing, surface);
  const os = Platform.OS === 'android' ? 'android' : 'ios';
  return { notice: photoLibraryNotice(outcome, os), failure: photoLibraryFailure(outcome, os) };
}
