// What the export replay worker needs, captured synchronously at the press: save-on-delete clears
// the live engine right after it, so nothing here may read engine state later. createImageBitmap
// takes its copy of a canvas when it is called; the ops are recorded once and never edited, except
// a Magic op's colour sheet, which a page change re-codes, so the sheet is captured with it.

import { crayonOptionsSnapshot } from './crayonBrush';
import { crayonDepositionMode } from './crayonPassBuffer';
import type { MagicSheetSnapshot } from './magicBrush';
import type { ReplayCrayonConfig, ReplayOp } from './pngEncoderProtocol';
import type { StrokeOp } from './strokeOps';

interface PendingBitmap {
  bitmap: Promise<ImageBitmap>;
}

export interface ReplayCapture {
  base: Array<PendingBitmap & { x: number; y: number }>;
  commands: ReplayOp[][];
  sheets: Array<PendingBitmap & Omit<MagicSheetSnapshot, 'canvas'>>;
  paper: { width: number; height: number } | null;
  crayon: ReplayCrayonConfig;
}

// `liveSheet` is what a Magic op recorded before its sheet decoded falls back to, exactly as the
// main-thread replay's renderOp does at the same moment.
export function serializeReplayCommands(
  commands: ReadonlyArray<readonly StrokeOp[]>,
  liveSheet: MagicSheetSnapshot | null
): { commands: ReplayOp[][]; sheets: MagicSheetSnapshot[] } {
  const sheets: MagicSheetSnapshot[] = [];
  const sheetIndex = new Map<MagicSheetSnapshot, number>();
  const indexOf = (sheet: MagicSheetSnapshot) => {
    let index = sheetIndex.get(sheet);
    if (index === undefined) {
      index = sheets.push(sheet) - 1;
      sheetIndex.set(sheet, index);
    }
    return index;
  };
  const wire = commands.map((ops) =>
    ops.map((op): ReplayOp => {
      if ((op.kind !== 'dot' && op.kind !== 'path') || !op.magic) return op;
      const sheet = op.magicSheet ?? liveSheet;
      const { magicSheet: _sheet, ...rest } = op;
      return sheet ? { ...rest, sheet: indexOf(sheet) } : rest;
    })
  );
  return { commands: wire, sheets };
}

export function captureReplay({
  base,
  commands,
  liveSheet,
  paper,
}: {
  base: ReadonlyArray<{ canvas: HTMLCanvasElement; x: number; y: number }>;
  commands: ReadonlyArray<readonly StrokeOp[]>;
  liveSheet: MagicSheetSnapshot | null;
  paper: { width: number; height: number } | null;
}): ReplayCapture {
  const wire = serializeReplayCommands(commands, liveSheet);
  return {
    base: base.map(({ canvas, x, y }) => ({ bitmap: createImageBitmap(canvas), x, y })),
    commands: wire.commands,
    sheets: wire.sheets.map(({ canvas, originX, originY, sourceUrl }) => ({
      bitmap: createImageBitmap(canvas),
      originX,
      originY,
      sourceUrl,
    })),
    paper,
    crayon: { options: crayonOptionsSnapshot(), deposition: crayonDepositionMode() },
  };
}

export function closeReplayCapture(capture: ReplayCapture) {
  for (const { bitmap } of [...capture.base, ...capture.sheets]) {
    void bitmap.then(
      (resolved) => resolved.close(),
      () => undefined
    );
  }
}
