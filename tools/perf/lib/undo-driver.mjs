// One definition of the undo response measurement, shared by every transport that
// scores it. The matrix compares undo timing across iPad, Android, and Mac rows, so
// the click, the `engine.undo` pairing, and the next-frame deadline have to be the
// same code — a second copy would silently redefine the metric for one row.

export const UNDO_ACTION_SETTLE_MS = 500;
export const UNDO_ACTION_PAUSE_MS = 120;
export const UNDO_MEASURE_TIMEOUT_MS = 5_000;
export const UNDO_BUTTON_READY_TIMEOUT_MS = 10_000;
export const UNDO_BUTTON_READY_POLL_MS = 250;

export const EXPAND_CONTROLS_SOURCE = `document.querySelector('button[aria-label="Expand controls"]')?.click(); return true;`;

export const UNDO_BUTTON_READY_SOURCE = `const button = document.querySelector('#undoButton'); return !!button && !button.disabled;`;

// A promise-valued expression rather than a statement body: WebDriver's
// executeAsync hands the result to a trailing callback while Playwright awaits a
// returned promise, and an expression adapts to both without restating the body.
export function undoActionPromiseSource(index, timeoutMs = UNDO_MEASURE_TIMEOUT_MS) {
  return `new Promise((resolve) => {
    const button = document.querySelector('#undoButton');
    if (!button || button.disabled) {
      resolve(null);
      return;
    }
    const beforeCount = performance.getEntriesByName('engine.undo', 'measure').length;
    const startedAt = performance.now();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    const finishAfterMeasure = () => {
      const measures = performance.getEntriesByName('engine.undo', 'measure');
      const measure = measures.at(-1);
      if (measures.length === beforeCount + 1 && Number.isFinite(measure?.duration)) {
        requestAnimationFrame((paintedAt) => {
          resolve({
            index: ${index},
            startedAt,
            endedAt: performance.now(),
            beforeCount,
            afterCount: measures.length,
            engineMs: measure.duration,
            nextFrameMs: paintedAt - startedAt
          });
        });
        return;
      }
      if (performance.now() - startedAt >= ${timeoutMs}) {
        resolve(null);
        return;
      }
      requestAnimationFrame(finishAfterMeasure);
    };
    finishAfterMeasure();
  })`;
}

export function assertUndoAction(action, index) {
  if (
    !action ||
    action.afterCount !== action.beforeCount + 1 ||
    !Number.isFinite(action.engineMs)
  ) {
    throw new Error(`Undo action ${index + 1} did not produce one engine.undo measure`);
  }
  return action;
}
