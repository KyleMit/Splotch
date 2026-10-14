import { useEffect, useRef, useState } from 'react';
import type { AiState } from '../ai/generation';
import { aiRun } from '../ai/uiState';
import type { PictureFormat } from '../export/pictureFilename';
import { isUnsaved, type PictureSaveOutcome, type UnsavedOutcome } from '../export/pictureSave';
import { savePicture } from '../keepPicture';

// Where an auto-saved run's picture went, which the AI Result's footer reports instead of its
// Download, as shipping's setAiAutoSave records it.
export type AiAutoSave = Readonly<{ status: 'saving' }> | Readonly<{ status: PictureSaveOutcome }>;

const PNG_DATA_PREFIX = 'data:image/png;base64,';

// Shipping's AI auto-save (drawing/aiAutoSave.ts): with Auto-save AI pictures on, a run this
// session sent saves its finished picture through the Screenshot Button's save path, then the
// drawing behind it unless that same drawing was already saved. A save that does not land goes to
// the Save Failure Banner. Runs in the screen, so a picture that lands while the run waits in the
// corner is saved too.
export function useAiAutoSave(
  state: AiState | null,
  enabled: boolean,
  report: (outcome: UnsavedOutcome, base64: string | null, format?: PictureFormat) => void
): AiAutoSave | null {
  const [saves, setSaves] = useState<Readonly<Record<number, AiAutoSave>>>({});
  const started = useRef(new Set<number>());
  const savedDrawing = useRef<string | null>(null);
  const reportRef = useRef(report);
  reportRef.current = report;
  const run = state ? aiRun(state) : null;
  const picture = run?.picture ?? null;
  const submitted = run?.submitted ?? null;
  const id = run?.id ?? null;
  useEffect(() => {
    if (!enabled || !picture || !submitted || id === null || started.current.has(id)) return;
    started.current.add(id);
    const record = (save: AiAutoSave) => setSaves((current) => ({ ...current, [id]: save }));
    record({ status: 'saving' });
    void (async () => {
      const kept = await import('../ai/keepAiPicture').then(
        ({ keepAiPicture }) => keepAiPicture(picture),
        () => ({ outcome: 'failed' as const, base64: null, format: undefined })
      );
      record({ status: kept.outcome });
      if (isUnsaved(kept.outcome)) reportRef.current(kept.outcome, kept.base64, kept.format);
      const drawing = submitted.startsWith(PNG_DATA_PREFIX)
        ? submitted.slice(PNG_DATA_PREFIX.length)
        : null;
      if (!drawing || drawing === savedDrawing.current) return;
      const outcome = await savePicture(drawing);
      if (isUnsaved(outcome)) reportRef.current(outcome, drawing);
      else savedDrawing.current = drawing;
    })();
  }, [enabled, picture, submitted, id]);
  return id === null ? null : (saves[id] ?? null);
}
