// The eraser needs ink to remove, or its cell measures erasing blank paper. Both
// capture transports give it that ink by painting the live tiles directly, and
// both previously trusted the paint (issue 1302): nothing checked that the fill
// produced opaque pixels, and a fill that silently did nothing left a capture
// that passed fidelity, passed the drawing gate, and recorded a plausible number.
//
// This module is the single source for the fill so the two injectors — the
// split-capture page bootstrap, which composes it into its generated script, and
// the Appium screen runner, which sends it through `execute` — cannot drift.
// It exports the function's SOURCE rather than the function because both
// consumers run it inside a page, not in this process.

export const ERASER_FILL_COLOR = '#7c4dff';
// How long a page may take to finish realizing its tile backings before the
// fill gives up. Backing migration runs one tile per frame (16 tiles at 60 Hz is
// ~270 ms); this budget covers a stalled first frame several times over.
export const ERASER_FILL_BACKING_TIMEOUT_MS = 4_000;

// A verified fill returns `{ tiles, backings, transparentTiles }`; a fill that
// cannot yet run safely returns `{ pending: [...] }` naming the tiles it is
// waiting on.
//
// The pending state exists because the engine defers hidden-tile backing
// realization on a blank canvas (one tile per frame): a fill painted into a
// backing that still lags its intended size is WIPED when the first stroke
// resizes that backing, so even the first eraser pass would erase nothing on
// that tile. The engine publishes the intended size on `data-tile-backing`, so
// the fill waits for every backing to reach it rather than painting pixels the
// stroke will destroy. A tile publishing NO intent is also pending — filling
// whatever backing it happens to hold is the vacuous pass this module exists
// to prevent, and the engine's own comments say a DOM-inspected size is not
// authoritative for an idle canvas.
//
// Verification samples the four corners and the centre of each backing and
// requires fully opaque pixels — what destination-out erasing needs to do real
// work — and the caller fails the capture on any transparent tile instead of
// banking a normal-looking artifact. The samples are read through a 1x1
// { willReadFrequently: true } scratch (the product's emptyScan.ts pattern):
// getImageData directly on the live tiles' accelerated contexts can demote all
// sixteen out of GPU raster in the last half-second before the eraser cell
// measures tile rendering cost — a verification must not change the thing
// being measured.
// Refill the tiles after each gesture pass, so every pass erases real ink
// (issue 1292). Placement schedules cannot do this job: measured against the
// exact parallel-lane metric, the optimal schedule still saturates a 700x300
// landscape canvas by pass 5 (fresh-path fractions 100/55/10/20/7/0/0/0/0/0%),
// because ten passes of lanes simply exceed the reachable area. Refilling
// restores full ink between passes and keeps the eraser's geometry identical
// to every other brush's fixed plan.
//
// The refill runs in the pointer-up gap after a pass's last stroke — never in
// contact, so lostFrameTimeShare (charged over in-contact intervals only) does
// not price it; the next stroke starts at least a stroke-pause later. The last
// pass's final pointerup deliberately does not refill: there is nothing left
// to erase, and painting fresh ink under the closing probe would be work the
// capture never asked for. Each refill's verification result is kept on
// `window.__eraserRefills` and travels home in the report, so the artifact can
// prove every pass had ink — an anomalous refill (pending or transparent) is
// recorded rather than thrown, because aborting mid-gesture would destroy the
// capture the evidence exists to judge. The record is CONSUMED downstream
// (issue 1355): `anomalousEraserRefills` in campaign-plan.mjs is the shared
// reader, acceptance refuses the artifact (`eraser-fill-failed`), and the
// matrix refuses the fold — recorded-not-thrown here, read-and-refused there.
export function eraserRefillFunctionSource() {
  return `function armEraserRefill(everyStrokes, totalStrokes, fillEraserInk) {
    const refills = [];
    window.__eraserRefills = refills;
    let strokes = 0;
    window.addEventListener(
      'pointerup',
      (event) => {
        if (!event.target || !event.target.closest || !event.target.closest('.canvas-stack')) {
          return;
        }
        strokes += 1;
        if (strokes % everyStrokes !== 0 || strokes >= totalStrokes) return;
        try {
          const result = fillEraserInk();
          refills.push({
            afterStroke: strokes,
            pending: !!result.pending,
            transparentTiles: result.transparentTiles ?? [],
          });
        } catch (error) {
          refills.push({ afterStroke: strokes, error: String((error && error.message) || error) });
        }
      },
      true
    );
    return refills;
  }`;
}

// `fillEraserInk(true)` verifies WITHOUT painting: the post-settle check runs
// in that mode first, so a fill wiped during the settle window is seen and
// recorded (`repairedAfterSettle`) instead of silently repainted — a wipe
// after backing realization is evidence of instability that may recur during
// the measured gesture, and an always-paint check could never report it.
export function eraserFillFunctionSource() {
  return `function fillEraserInk(verifyOnly) {
    const tiles = [...document.querySelectorAll('canvas[data-live-tile]')];
    if (!tiles.length) throw new Error('no live tiles to fill for the eraser');
    const lagging = [];
    for (const canvas of tiles) {
      const intended = (canvas.dataset.tileBacking || '').split('x').map(Number);
      if (intended.length !== 2 || !intended.every((size) => Number.isFinite(size) && size > 0)) {
        lagging.push('no published intent vs ' + canvas.width + 'x' + canvas.height);
        continue;
      }
      if (canvas.width !== intended[0] || canvas.height !== intended[1]) {
        lagging.push(canvas.dataset.tileBacking + ' vs ' + canvas.width + 'x' + canvas.height);
      }
    }
    if (lagging.length) return { pending: lagging };
    const scratch = document.createElement('canvas');
    scratch.width = 1;
    scratch.height = 1;
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
    const sampleAlpha = (canvas, x, y) => {
      scratchContext.clearRect(0, 0, 1, 1);
      scratchContext.drawImage(canvas, x, y, 1, 1, 0, 0, 1, 1);
      return scratchContext.getImageData(0, 0, 1, 1).data[3];
    };
    const backings = [];
    const transparentTiles = [];
    tiles.forEach((canvas, index) => {
      if (!verifyOnly) {
        const context = canvas.getContext('2d');
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = '${ERASER_FILL_COLOR}';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
      }
      backings.push(canvas.width + 'x' + canvas.height);
      const samplePoints = [
        [0, 0],
        [canvas.width - 1, 0],
        [0, canvas.height - 1],
        [canvas.width - 1, canvas.height - 1],
        [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)],
      ];
      const opaque =
        canvas.width > 0 &&
        canvas.height > 0 &&
        samplePoints.every(([x, y]) => sampleAlpha(canvas, x, y) === 255);
      if (!opaque) transparentTiles.push(index);
    });
    return { tiles: tiles.length, backings, transparentTiles };
  }`;
}
