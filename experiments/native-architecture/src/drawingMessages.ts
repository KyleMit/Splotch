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

// The notice the screen announces and the failure it shows, kept apart by how each was written.
export function useDrawingMessages() {
  const [notice, setNoticeText] = useState('Pick a color and draw.');
  const [failure, setFailure] = useState<DrawingFailure | null>(null);
  return {
    notice,
    failure,
    dismissFailure: () => setFailure(null),
    setNotice(text: string) {
      setNoticeText(text);
      setFailure((current) => (current?.kind === 'error' ? null : current));
    },
    recordSave(kept: KeptPicture) {
      setFailure(kept.failure ? { kind: 'save', ...kept.failure } : null);
    },
    // A save that did not land at all, in the shipping banner's words for a failed save; the
    // banner speaks them, so the notice clears.
    failSave() {
      setNoticeText('');
      setFailure({ kind: 'save', heading: UNSAVED_HEADING, detail: FAILED_DETAIL });
    },
    report(error: unknown) {
      const detail = drawingErrorMessage(error);
      setNoticeText(detail);
      setFailure({ kind: 'error', detail });
    },
  };
}

function drawingErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'That did not finish. Your picture is still here.';
}
