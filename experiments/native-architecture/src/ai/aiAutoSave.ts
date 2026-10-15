import type { AiResult } from './journal';
import type { KeptAiPicture } from './keepAiPicture';
import type { PictureFormat } from '../export/pictureFilename';
import type { AiAutoSave as ShippingAiAutoSave } from '../../../../web/src/lib/ai/autoSaveCopy';
import { isUnsaved, type PictureSaveOutcome, type UnsavedOutcome } from '../export/pictureSave';

// Where an auto-saved run's picture went, which the AI Result's footer reports instead of its
// Download, as shipping's setAiAutoSave records it.
export type AiAutoSave = ShippingAiAutoSave;

const PNG_DATA_PREFIX = 'data:image/png;base64,';

// Shipping's AI auto-save (drawing/aiAutoSave.ts): a run this session sent saves its finished
// picture, then the drawing behind it. The drawing follows only while the run still owns the card,
// so a closed or replaced run saves nothing more, and a drawing already saved or still being saved
// by another run is not saved twice; one that did not land is tried again by the next run.
export function createAiAutoSave(deps: {
  keep: (picture: AiResult) => Promise<KeptAiPicture>;
  save: (pngBase64: string) => Promise<PictureSaveOutcome>;
  report: (outcome: UnsavedOutcome, base64: string | null, format?: PictureFormat) => void;
  publish: (id: number, save: AiAutoSave) => void;
  // Whether this run's card is still the open one.
  owns: (id: number) => boolean;
}) {
  const started = new Set<number>();
  let claimedDrawing: string | null = null;
  return async (id: number, picture: AiResult, submitted: string) => {
    if (started.has(id)) return;
    started.add(id);
    deps.publish(id, { status: 'saving' });
    const kept = await deps.keep(picture);
    deps.publish(id, typeof kept.outcome === 'object' ? kept.outcome : { status: kept.outcome });
    if (isUnsaved(kept.outcome)) deps.report(kept.outcome, kept.base64, kept.format);
    const drawing = submitted.startsWith(PNG_DATA_PREFIX)
      ? submitted.slice(PNG_DATA_PREFIX.length)
      : null;
    if (!deps.owns(id) || !drawing || drawing === claimedDrawing) return;
    const previous = claimedDrawing;
    claimedDrawing = drawing;
    const outcome = await deps.save(drawing);
    if (!isUnsaved(outcome)) return;
    deps.report(outcome, drawing);
    if (claimedDrawing === drawing) claimedDrawing = previous;
  };
}
