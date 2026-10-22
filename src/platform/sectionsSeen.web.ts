import { STORAGE_KEYS } from '../lib/storageKeys';
import { createSectionsSeen } from '../settings/sectionsSeen';

export const sectionsSeen = createSectionsSeen({
  read: async () => localStorage.getItem(STORAGE_KEYS.parentSectionsSeen),
  write: async (snapshot) => localStorage.setItem(STORAGE_KEYS.parentSectionsSeen, snapshot),
});
