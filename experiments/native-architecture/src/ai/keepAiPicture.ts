import { keptPicture, type KeptPicture } from '../keepPicture';
import { AI_IMAGE_BASENAME } from '../export/pictureFilename';
import type { PictureSaveOutcome } from '../export/pictureSave';
import { aiPictureBase64 } from '../platform/aiPictureBase64';
import { pictureSave } from '../platform/pictureSave';
import type { AiResult } from './journal';

// The AI Result's Download keeps the picture where the Screenshot Button keeps a drawing: the
// photo library on Android and iOS, a download on the web, as shipping's saveAiResult saves
// through the same pipeline as every other save.
export async function keepAiPicture(picture: AiResult): Promise<KeptPicture> {
  let outcome: PictureSaveOutcome;
  try {
    const base64 = await aiPictureBase64(picture);
    outcome = await pictureSave.save(base64, { baseName: AI_IMAGE_BASENAME, mime: picture.mime });
  } catch {
    outcome = 'failed';
  }
  return keptPicture(outcome);
}
