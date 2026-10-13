import { resultImageGrid, type AiImageAdmission } from '../ai/imageAdmission';
import { AI_IMAGE_DECODE_TIMEOUT_MS, invalidImage } from '../ai/imageBounds';

export const admitAiImage: AiImageAdmission = async (bytes, mime) => {
  const grid = await resultImageGrid(bytes, mime, () => true);
  const picture = new Image();
  const uri = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: mime }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    picture.decoding = 'async';
    picture.src = uri;
    await Promise.race([
      picture.decode(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('AI picture decoding did not finish.')),
          AI_IMAGE_DECODE_TIMEOUT_MS
        );
      }),
    ]);
    if (picture.naturalWidth !== grid.width || picture.naturalHeight !== grid.height)
      invalidImage();
  } finally {
    clearTimeout(timer);
    picture.src = '';
    URL.revokeObjectURL(uri);
  }
};
