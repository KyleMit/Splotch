import type { PictureSave } from '../export/pictureSave';
import { DRAWING_PICTURE, pictureFilename } from '../export/pictureFilename';
import { browserFolderSave } from './browserFolderSaveLoader';

function pictureBlob(base64: string, type: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

// A browser has no photo library to write to, so the picture downloads, as the shipping web
// Screenshot Button's does: an object URL handed to a download anchor, revoked once clicked.
export const pictureSave: PictureSave = {
  async save(base64, format = DRAWING_PICTURE, options) {
    try {
      const blob = pictureBlob(base64, format.mime);
      const filename = pictureFilename(new Date(), format);
      const { folderSave: folder } = await browserFolderSave.load();
      const folderName = await folder.saveBlobToFolder(blob, filename, options);
      if (folderName !== null) return { status: 'chosenFolder', folderName };
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
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
