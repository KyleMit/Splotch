import {
  decodeDrawingDraft,
  serializeDrawingDraftStorage,
  type DrawingDraftStorage,
} from '../product/drawingDraft';

const CURRENT_DRAFT_KEY = 'splotch-candidate:current-draft-v1';

export const drawingDraftStorage: DrawingDraftStorage = serializeDrawingDraftStorage({
  async read() {
    const snapshot = localStorage.getItem(CURRENT_DRAFT_KEY);
    decodeDrawingDraft(snapshot);
    return snapshot;
  },
  async write(snapshot) {
    decodeDrawingDraft(snapshot);
    localStorage.setItem(CURRENT_DRAFT_KEY, snapshot);
    if (localStorage.getItem(CURRENT_DRAFT_KEY) !== snapshot)
      throw new Error('The current draft could not be verified.');
  },
});

export async function protectedDraftPageIds(): Promise<readonly string[]> {
  const drawing = decodeDrawingDraft(await drawingDraftStorage.read());
  return drawing ? [drawing.pageId] : [];
}
