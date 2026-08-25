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
// cannot yet run safely returns `{ pending: [...] }` naming the lagging tiles.
//
// The pending state exists because the engine defers hidden-tile backing
// realization on a blank canvas (one tile per frame): a fill painted into a
// backing that still lags its intended size is WIPED when the first stroke
// resizes that backing, so even the first eraser pass would erase nothing on
// that tile. The engine publishes the intended size on `data-tile-backing`
// (pinned by tiledRendererContract.test.ts), so the fill waits for every
// backing to reach it rather than painting pixels the stroke will destroy.
//
// Verification samples the four corners and the centre of each backing and
// requires fully opaque pixels — that is what destination-out erasing needs to
// do real work — and the caller fails the capture on any transparent tile
// instead of banking a normal-looking artifact.
export function eraserFillFunctionSource() {
  return `function fillEraserInk() {
    const tiles = [...document.querySelectorAll('canvas[data-live-tile]')];
    if (!tiles.length) throw new Error('no live tiles to fill for the eraser');
    const lagging = [];
    for (const canvas of tiles) {
      const intended = (canvas.dataset.tileBacking || '').split('x').map(Number);
      if (intended.length !== 2 || !intended.every((size) => Number.isFinite(size) && size > 0)) {
        continue;
      }
      if (canvas.width !== intended[0] || canvas.height !== intended[1]) {
        lagging.push(canvas.dataset.tileBacking + ' vs ' + canvas.width + 'x' + canvas.height);
      }
    }
    if (lagging.length) return { pending: lagging };
    const backings = [];
    const transparentTiles = [];
    tiles.forEach((canvas, index) => {
      const context = canvas.getContext('2d');
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '${ERASER_FILL_COLOR}';
      context.fillRect(0, 0, canvas.width, canvas.height);
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
        samplePoints.every(([x, y]) => context.getImageData(x, y, 1, 1).data[3] === 255);
      context.restore();
      if (!opaque) transparentTiles.push(index);
    });
    return { tiles: tiles.length, backings, transparentTiles };
  }`;
}
