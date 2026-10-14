import { afterEach, vi } from 'vitest';

// The per-device choices a launch reads before the drawing screen paints. Every case starts on a
// first launch: no brush choice, and no remembered Tool Drawer. An Error as the drawer's value
// stands for a store that refuses every read and write.
export const drawerStore = { value: null };
afterEach(() => {
  drawerStore.value = null;
});
function drawerStoreValue() {
  if (drawerStore.value instanceof Error) throw drawerStore.value;
  return drawerStore.value;
}
vi.mock('../../../experiments/native-architecture/src/platform/drawerOpen.ts', () => ({
  drawerOpenStorage: {
    read: drawerStoreValue,
    write: (value) => {
      drawerStoreValue();
      drawerStore.value = value;
    },
  },
}));
vi.mock('../../../experiments/native-architecture/src/platform/brushPreferences.ts', () => ({
  brushPreferencesStorage: { read: async () => null, write: async () => {} },
}));
