import { File, Paths } from 'expo-file-system';
import { STORAGE_KEYS } from '../../../../web/src/lib/storageKeys';

// The Tool Drawer's open state in shipping's writeBool spelling, read synchronously so the first
// frame already shows the remembered drawer.
export type DrawerOpenStorage = {
  read: () => string | null;
  write: (value: string) => void;
};

function stateFile() {
  return new File(Paths.document, STORAGE_KEYS.drawerOpen);
}

export const drawerOpenStorage: DrawerOpenStorage = {
  read() {
    const file = stateFile();
    return file.exists ? file.textSync() : null;
  },
  write(value) {
    const file = stateFile();
    if (!file.exists) file.create();
    file.write(value);
  },
};
