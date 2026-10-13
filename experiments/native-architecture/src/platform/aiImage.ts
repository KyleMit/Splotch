import { NativeModules } from 'react-native';
import { resultImageGrid, type AiImageAdmission } from '../ai/imageAdmission';
import { AI_IMAGE_DECODE_TIMEOUT_MS, invalidImage } from '../ai/imageBounds';
import { bytesBase64 } from '../ai/base64';
type Decoder = {
  decodeImage(base64: string, mime: string, width: number, height: number): Promise<unknown>;
};
function decoder(): Decoder {
  const value: unknown = NativeModules.SplotchAIEnvironment;
  if (
    !value ||
    typeof value !== 'object' ||
    !('decodeImage' in value) ||
    typeof value.decodeImage !== 'function'
  )
    throw new Error('Native AI picture decoding is unavailable.');
  return value as Decoder;
}
export const admitAiImage: AiImageAdmission = async (bytes, mime) => {
  const grid = await resultImageGrid(bytes, mime, () => true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      decoder().decodeImage(bytesBase64(bytes), mime, grid.width, grid.height),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('AI picture decoding did not finish.')),
          AI_IMAGE_DECODE_TIMEOUT_MS
        );
      }),
    ]);
    if (
      !value ||
      typeof value !== 'object' ||
      !('width' in value) ||
      !('height' in value) ||
      value.width !== grid.width ||
      value.height !== grid.height ||
      Object.keys(value).sort().join(',') !== 'height,width'
    )
      invalidImage();
  } finally {
    clearTimeout(timer);
  }
};
