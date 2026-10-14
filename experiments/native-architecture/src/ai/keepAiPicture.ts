import { savePicture } from '../keepPicture';
import { AI_IMAGE_BASENAME, type PictureFormat } from '../export/pictureFilename';
import type { PictureSaveOutcome } from '../export/pictureSave';
import { aiPictureBase64 } from '../platform/aiPictureBase64';
import type { AiResult } from './journal';

// What a Download did with the AI picture, and the bytes and format the Save Failure Banner's Try
// again saves when it did not land.
export type KeptAiPicture = Readonly<{
  outcome: PictureSaveOutcome;
  base64: string | null;
  format: PictureFormat;
}>;

// The AI Result's Download keeps the picture where the Screenshot Button keeps a drawing: the
// photo library on Android and iOS, a download on the web, as shipping's saveAiResult saves
// through the same pipeline as every other save.
export async function keepAiPicture(picture: AiResult): Promise<KeptAiPicture> {
  const format = { baseName: AI_IMAGE_BASENAME, mime: picture.mime };
  let base64: string;
  try {
    base64 = await aiPictureBase64(picture);
  } catch {
    return { outcome: 'failed', base64: null, format };
  }
  return { outcome: await savePicture(base64, format), base64, format };
}
