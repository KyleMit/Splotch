import { afterEach, beforeEach, vi } from 'vitest';

vi.mock('../../../experiments/native-architecture/src/product/afterDrawingPaint.ts', async () => {
  const { drawingPaint } =
    await import('../../../experiments/native-architecture/src/product/drawingPaint.ts');
  return { afterDrawingPaint: () => drawingPaint.painted().then(() => {}) };
});

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

const clearSoundPort = vi.hoisted(() => ({
  notes: 'unavailable',
  load: vi.fn(),
  play: vi.fn(),
  note: vi.fn(),
}));
export { clearSoundPort };
beforeEach(() => {
  for (const key of ['load', 'play', 'note']) clearSoundPort[key].mockClear();
  clearSoundPort.notes = 'unavailable';
});
vi.mock('../../../experiments/native-architecture/src/platform/clearSound.ts', () => ({
  loadClearPageTurn: async (signal, publishNotes) => {
    clearSoundPort.load(signal);
    if (clearSoundPort.notes === 'available') publishNotes(clearSoundPort.note);
    return { play: clearSoundPort.play, dispose() {} };
  },
}));
