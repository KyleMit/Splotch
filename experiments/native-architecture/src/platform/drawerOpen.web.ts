import { STORAGE_KEYS } from '../../../../web/src/lib/storageKeys';
import type { DrawerOpenStorage } from './drawerOpen';

export const drawerOpenStorage: DrawerOpenStorage = {
  read: () => localStorage.getItem(STORAGE_KEYS.drawerOpen),
  write: (value) => localStorage.setItem(STORAGE_KEYS.drawerOpen, value),
};
