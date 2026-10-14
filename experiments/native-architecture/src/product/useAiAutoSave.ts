import { useEffect, useRef, useState } from 'react';
import type { AiAutoSave } from '../ai/aiAutoSave';
import type { AiState } from '../ai/generation';
import type { AiResult } from '../ai/journal';
import { aiRun } from '../ai/uiState';
import { AI_IMAGE_BASENAME, type PictureFormat } from '../export/pictureFilename';
import type { UnsavedOutcome } from '../export/pictureSave';
import { savePicture } from '../keepPicture';

type Saver = ReturnType<typeof import('../ai/aiAutoSave').createAiAutoSave>;
type Report = (outcome: UnsavedOutcome, base64: string | null, format?: PictureFormat) => void;

// Hands each run to the saver, which loads with the first picture it saves. A load that fails is
// forgotten, so the next run loads it again; the run it failed is a save that never started,
// reported as shipping's aiAutoSave reports a failed save-pipeline load.
export function createAutoSaveRunner(
  load: () => Promise<Saver>,
  failed: (id: number, picture: AiResult) => void
) {
  let saver: Promise<Saver> | null = null;
  const handled = new Set<number>();
  return (id: number, picture: AiResult, submitted: string) => {
    if (handled.has(id)) return;
    handled.add(id);
    saver ??= load().catch((error: unknown) => {
      saver = null;
      throw error;
    });
    void saver.then(
      (save) => save(id, picture, submitted),
      () => failed(id, picture)
    );
  };
}

// Shipping's AI auto-save, run in the screen so a picture that lands while the run waits in the
// corner is saved too.
export function useAiAutoSave(
  state: AiState | null,
  enabled: boolean,
  report: Report
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
  const [runAutoSave] = useState(() => {
    const publish = (run: number, save: AiAutoSave) =>
      setSaves((current) => ({ ...current, [run]: save }));
    return createAutoSaveRunner(
      () =>
        import('../ai/aiAutoSave').then(({ createAiAutoSave }) =>
          createAiAutoSave({
            keep: (kept) =>
              import('../ai/keepAiPicture').then(
                ({ keepAiPicture }) => keepAiPicture(kept),
                () => ({ outcome: 'failed', base64: null, format: aiFormat(kept) })
              ),
            save: savePicture,
            report: (...args) => reportRef.current(...args),
            publish,
            owns: (run) => owner.current === run,
          })
        ),
      (run, kept) => {
        publish(run, { status: 'failed' });
        reportRef.current('failed', null, aiFormat(kept));
      }
    );
  });
  useEffect(() => {
    if (enabled && picture && submitted && id !== null) runAutoSave(id, picture, submitted);
  }, [runAutoSave, enabled, picture, submitted, id]);
  return id === null ? null : (saves[id] ?? null);
}

function aiFormat(picture: AiResult): PictureFormat {
  return { baseName: AI_IMAGE_BASENAME, mime: picture.mime };
}
