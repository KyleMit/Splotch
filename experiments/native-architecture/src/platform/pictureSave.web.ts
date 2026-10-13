import type { PictureSave } from '../export/pictureSave';
import { pictureFilename } from '../export/pictureFilename';

const PNG_TYPE = 'image/png';

function pngBlob(pngBase64: string) {
  const binary = atob(pngBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: PNG_TYPE });
}

// A browser has no photo library to write to, so the picture downloads, as the shipping web
// Screenshot Button's does: an object URL handed to a download anchor, revoked once clicked.
export const pictureSave: PictureSave = {
  async save(pngBase64) {
    try {
      const url = URL.createObjectURL(pngBlob(pngBase64));
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = pictureFilename(new Date());
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      return 'downloads';
    } catch {
      return 'failed';
    }
  },
};
