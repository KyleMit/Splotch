import type { HeldPicture } from './saveFailure';
import { AI_IMAGE_BASENAME, DRAWING_BASENAME } from './pictureFilename';

function recognizedPicture(value: unknown): value is HeldPicture {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const picture = value as Record<string, unknown>;
  if (
    typeof picture.pngBase64 !== 'string' ||
    picture.pngBase64.length === 0 ||
    (picture.outcome !== 'denied' &&
      picture.outcome !== 'failed' &&
      picture.outcome !== 'unavailable')
  )
    return false;
  if (picture.format === undefined) return true;
  if (!picture.format || typeof picture.format !== 'object' || Array.isArray(picture.format))
    return false;
  const format = picture.format as Record<string, unknown>;
  return (
    (format.baseName === DRAWING_BASENAME || format.baseName === AI_IMAGE_BASENAME) &&
    (format.mime === 'image/png' || format.mime === 'image/jpeg' || format.mime === 'image/webp')
  );
}

export function readUnsavedPictures(value: unknown): readonly HeldPicture[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const pictures = value.filter(recognizedPicture);
  return pictures.length > 0 ? pictures : null;
}
