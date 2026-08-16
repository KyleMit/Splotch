import type { MagicSheetSnapshot } from './magicBrush';
import type { MagicRecodeUndo, MagicStrokeOp, StrokeGroupCommand } from './strokeOps';

interface TiledMagicRecodeHost<TBase> {
  history: () => StrokeGroupCommand[];
  activeCommand: () => StrokeGroupCommand | null;
  canBeginUndo: () => boolean;
  currentBase: () => TBase[];
  cloneBase: (source: readonly TBase[]) => TBase[];
  rebuildBase: (baseline: readonly TBase[], tail: readonly StrokeGroupCommand[]) => void;
  commitUndo: (command: StrokeGroupCommand) => void;
  repaint: (preserveUndoThrough: StrokeGroupCommand | null) => void;
}

function magicOps(command: StrokeGroupCommand): MagicStrokeOp[] {
  return command.ops.filter(
    (op): op is MagicStrokeOp => (op.kind === 'dot' || op.kind === 'path') && op.magic === true
  );
}

export function createTiledMagicRecode<TBase>(host: TiledMagicRecodeHost<TBase>) {
  // Once magic crosses the undo boundary, keep the raster immediately before it
  // plus the later vector tail so a page/theme recode can rebuild folded ink in
  // draw order. A folded clear releases both (ADR-0121).
  let baseline: TBase[] = [];
  const foldedTail: StrokeGroupCommand[] = [];

  function retainedCommands() {
    const active = host.activeCommand();
    return [...foldedTail, ...host.history(), ...(active ? [active] : [])];
  }

  function hasRetainedOps() {
    return retainedCommands().some((command) => magicOps(command).length > 0);
  }

  function rebuildBase() {
    if (baseline.length > 0) host.rebuildBase(baseline, foldedTail);
  }

  function beforeFold(command: StrokeGroupCommand) {
    if (command.magicRecode || (baseline.length === 0 && magicOps(command).length === 0)) return;
    if (baseline.length === 0) baseline = host.cloneBase(host.currentBase());
    foldedTail.push(command);
  }

  function afterFold(command: StrokeGroupCommand) {
    if (!command.ops.some((op) => op.kind === 'clear')) return;
    baseline = [];
    foldedTail.length = 0;
  }

  function beginUndo(targetSourceKey: string | null, restoreAppearance: () => void) {
    if (!host.canBeginUndo() || !hasRetainedOps()) return false;
    const magicRecode: MagicRecodeUndo = {
      targetSourceKey,
      previousSheets: new Map(),
      restoreAppearance,
      applied: false,
    };
    host.commitUndo({ ops: [], wasEmpty: false, magicRecode });
    return true;
  }

  function pendingCommand(sourceKey: string | null) {
    return host
      .history()
      .findLast(
        (command) =>
          command.magicRecode?.applied === false &&
          command.magicRecode.targetSourceKey === sourceKey
      );
  }

  function recode(snapshot: MagicSheetSnapshot, sourceKey: string | null) {
    const pending = pendingCommand(sourceKey);
    let changed = false;
    for (const command of retainedCommands()) {
      for (const op of magicOps(command)) {
        if (op.magicSheet?.canvas === snapshot.canvas) continue;
        if (pending?.magicRecode && !pending.magicRecode.previousSheets.has(op)) {
          pending.magicRecode.previousSheets.set(op, op.magicSheet);
        }
        op.magicSheet = snapshot;
        changed = true;
      }
    }
    if (!changed) return false;
    if (pending?.magicRecode) pending.magicRecode.applied = true;
    rebuildBase();
    host.repaint(pending ?? null);
    return true;
  }

  function restore(command: StrokeGroupCommand | undefined) {
    if (!command?.magicRecode?.applied) return;
    for (const [op, previousSheet] of command.magicRecode.previousSheets) {
      op.magicSheet = previousSheet;
    }
    rebuildBase();
  }

  return {
    afterFold,
    baseTiles: () => baseline,
    beforeFold,
    beginUndo,
    hasRetainedOps,
    recode,
    restore,
  };
}
