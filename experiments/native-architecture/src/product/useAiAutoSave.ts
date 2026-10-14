import { useEffect, useRef, useState } from 'react';
import type { AiAutoSave } from '../ai/aiAutoSave';
import type { AiState } from '../ai/generation';
import { aiRun } from '../ai/uiState';
import { AI_IMAGE_BASENAME, type PictureFormat } from '../export/pictureFilename';
import type { UnsavedOutcome } from '../export/pictureSave';
import { savePicture } from '../keepPicture';

type Saver = ReturnType<typeof import('../ai/aiAutoSave').createAiAutoSave>;

// Shipping's AI auto-save, run in the screen so a picture that lands while the run waits in the
// corner is saved too. The saving itself loads with the first picture it saves.
export function useAiAutoSave(
  state: AiState | null,
  enabled: boolean,
  report: (outcome: UnsavedOutcome, base64: string | null, format?: PictureFormat) => void
): AiAutoSave | null {
  const [saves, setSaves] = useState<Readonly<Record<number, AiAutoSave>>>({});
  const reportRef = useRef(report);
  reportRef.current = report;
  const run = state ? aiRun(state) : null;
  const picture = run?.picture ?? null;
  const submitted = run?.submitted ?? null;
  const id = run?.id ?? null;
  const owner = useRef<number | null>(null);
  owner.current = state?.open ? id : null;
  const saver = useRef<Promise<Saver> | null>(null);
  useEffect(() => {
    if (!enabled || !picture || !submitted || id === null) return;
    saver.current ??= import('../ai/aiAutoSave').then(({ createAiAutoSave }) =>
      createAiAutoSave({
        keep: (kept) =>
          import('../ai/keepAiPicture').then(
            ({ keepAiPicture }) => keepAiPicture(kept),
            () => ({
              outcome: 'failed',
              base64: null,
              format: { baseName: AI_IMAGE_BASENAME, mime: kept.mime },
            })
          ),
        save: savePicture,
        report: (...args) => reportRef.current(...args),
        publish: (run, save) => setSaves((current) => ({ ...current, [run]: save })),
        owns: (run) => owner.current === run,
      })
    );
    void saver.current.then((save) => save(id, picture, submitted));
  }, [enabled, picture, submitted, id]);
  return id === null ? null : (saves[id] ?? null);
}
