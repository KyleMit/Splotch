import type { AiResult } from '../ai/journal';
import type { AiMime } from '../ai/contract';
import { readAiPictureBytes } from './aiStorage.web';

export const aiPictureSharePresentation = {
  label: 'Download AI picture',
  complete: 'Download requested. Your AI picture stays saved here.',
};
const EXTENSIONS: Record<AiMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function assertCurrent(isCurrent: () => boolean) {
  if (!isCurrent()) throw new Error('AI picture download was cancelled.');
}

function createAiPictureDownload() {
  let busy = false;
  return async (picture: AiResult, isCurrent: () => boolean): Promise<void> => {
    if (busy) throw new Error('Another AI picture download is still being prepared.');
    busy = true;
    try {
      assertCurrent(isCurrent);
      await readAiPictureBytes(picture);
      assertCurrent(isCurrent);
      if (!picture.uri.startsWith(`data:${picture.mime};base64,`))
        throw new Error('Reopen a saved AI picture before downloading it.');
      const link = document.createElement('a');
      try {
        link.href = picture.uri;
        link.download = `splotch-ai-${Date.now()}.${EXTENSIONS[picture.mime]}`;
        document.body.append(link);
        assertCurrent(isCurrent);
        link.click();
      } finally {
        link.remove();
      }
    } finally {
      busy = false;
    }
  };
}

export const shareAiPicture = createAiPictureDownload();
