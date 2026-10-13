import { useState } from 'react';
import { FAILED_DETAIL, UNSAVED_HEADING } from './export/photoLibrary';
import type { KeptPicture } from './keepPicture';

// What went wrong, apart from what the screen announces: a save the photo library refused, or an
// action that failed with an error. The drawing screen shows it in the Save Failure Banner. An
// error gives way to the next notice, as the notice it was written beside does; a refused save
// stays until it is dismissed or a later save settles.
type DrawingFailure =
  | Readonly<{ kind: 'save'; heading: string; detail: string }>
  | Readonly<{ kind: 'error'; detail: string }>;

type Notice = Readonly<{ text: string; failed: boolean }>;

// The notice the screen shows and the failure it reports, kept apart by how each was written. A
// notice written with a failure still shows where the screen prints its notice, but only the
// failure announces it: `routineNotice` carries a notice only when no failure wrote it, so each
// failure has one announcement and the banner owns it.
export function useDrawingMessages() {
  const [notice, setNoticeState] = useState<Notice>({
    text: 'Pick a color and draw.',
    failed: false,
  });
  const [failure, setFailure] = useState<DrawingFailure | null>(null);
  return {
    notice: notice.text,
    routineNotice: notice.failed ? '' : notice.text,
    failure,
    dismissFailure: () => setFailure(null),
    setNotice(text: string) {
      setNoticeState({ text, failed: false });
      setFailure((current) => (current?.kind === 'error' ? null : current));
    },
    // The save's notice was written just before; a refusal claims it.
    recordSave(kept: KeptPicture) {
      if (kept.failure) setNoticeState((current) => ({ ...current, failed: true }));
      setFailure(kept.failure ? { kind: 'save', ...kept.failure } : null);
    },
    // A save that did not land at all, in the shipping banner's words for a failed save.
    failSave() {
      setNoticeState({ text: '', failed: false });
      setFailure({ kind: 'save', heading: UNSAVED_HEADING, detail: FAILED_DETAIL });
    },
    report(error: unknown) {
      const detail = drawingErrorMessage(error);
      setNoticeState({ text: detail, failed: true });
      setFailure({ kind: 'error', detail });
    },
  };
}

function drawingErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'That did not finish. Your picture is still here.';
}
