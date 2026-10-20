import { File, Paths } from 'expo-file-system';
import { STORAGE_KEYS } from '../../../../web/src/lib/storageKeys';
import { createSectionsSeen } from '../settings/sectionsSeen';

function seenFile() {
  return new File(Paths.document, `${STORAGE_KEYS.parentSectionsSeen}.json`);
}

export const sectionsSeen = createSectionsSeen({
  async read() {
    const file = seenFile();
    return file.exists ? file.text() : null;
  },
  async write(snapshot) {
    const file = seenFile();
    if (!file.exists) file.create();
    await file.write(snapshot);
  },
});
