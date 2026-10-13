import { useState } from 'react';

// An action that failed with an error, apart from what the screen announces. The drawing screen
// shows it in the failure banner, and it gives way to the next notice, as the notice it was
// written beside does. A save that did not land is the Save Failure Banner's (export/saveFailure.ts).
type DrawingFailure = Readonly<{ kind: 'error'; detail: string }>;

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
      setFailure(null);
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
