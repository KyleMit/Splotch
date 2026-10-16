import type { Drawing, Point } from './model';

export const UNDO_GHOST_MS = 420;

export type UndoFeedback = Readonly<{ id: number; startedAt: number; reduced: boolean }>;
export type UndoGhost = UndoFeedback &
  Readonly<{
    before: Drawing;
    after: Drawing;
    towards: Point | null;
    onFinished: () => void;
  }>;
