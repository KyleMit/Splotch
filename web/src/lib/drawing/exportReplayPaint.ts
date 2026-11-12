// The replay worker's half of the export (ADR-0088): the same renderer, op order and crayon pass
// handling the page's compatibility replay uses (createStrokeSnapshot + renderTiledSnapshot), then
// the same paper and overlay composition, on one CPU surface.

import { crayonOptionsSnapshot, setCrayonOptions } from './crayonBrush';
import { configureCrayonDeposition, flushCrayonBuffer } from './crayonPassBuffer';
import { drawExportOverlay, paintExportPaper } from './exportCompositor';
import type { MagicSheetSnapshot } from './magicBrush';
import type { ReplayCrayonConfig, ReplayOp, ReplayPngInput } from './pngEncoderProtocol';
import type { StrokeOp } from './strokeOps';
import { renderTiledReadback } from './tiledRendererReadback';

// Production keeps crayonBrush's defaults, so the field rebuild a change costs runs only after the
// dev harness has tuned the page's options.
export function configureReplayCrayon({ options, deposition }: ReplayCrayonConfig) {
  if (JSON.stringify(crayonOptionsSnapshot()) !== JSON.stringify(options)) {
    setCrayonOptions(options);
  }
  configureCrayonDeposition(deposition);
}

export function restoreReplayOp(op: ReplayOp, sheets: readonly MagicSheetSnapshot[]): StrokeOp {
  if ((op.kind !== 'dot' && op.kind !== 'path') || op.sheet === undefined) return op;
  return { ...op, magicSheet: sheets[op.sheet] };
}

export function paintReplayExport(
  context: OffscreenCanvasRenderingContext2D,
  input: ReplayPngInput
) {
  // lib.dom models the offscreen context as unrelated to CanvasRenderingContext2D; the op renderers
  // draw only through the 2D API surface the two share.
  const target = context as unknown as CanvasRenderingContext2D;
  target.lineCap = 'round';
  target.lineJoin = 'round';
  target.scale(input.replayScale, input.replayScale);
  const sheets = input.sheets.map(({ bitmap, originX, originY, sourceUrl }) => ({
    canvas: bitmap,
    originX,
    originY,
    sourceUrl,
  }));
  renderTiledReadback(
    target,
    input.base.map(({ bitmap, x, y }) => ({ canvas: bitmap, x, y, painted: true })),
    input.commands.map((ops) => ({ ops: ops.map((op) => restoreReplayOp(op, sheets)) })),
    null,
    input.paper
  );
  // An in-flight crayon stroke's open pass sits unstamped on the pass buffer; the export is terminal
  // for this snapshot, so stamp it rather than drop that ink.
  flushCrayonBuffer(target);

  const width = input.width / input.exportScale;
  const height = input.height / input.exportScale;
  paintExportPaper(context, {
    width,
    height,
    scale: input.exportScale,
    paperColor: input.paperColor,
    texture: input.texture,
  });
  if (input.overlay) {
    drawExportOverlay(
      context,
      { source: input.overlay, width: input.overlay.width, height: input.overlay.height },
      { width, height, scale: input.exportScale }
    );
  }
}
