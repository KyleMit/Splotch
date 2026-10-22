import type { Drawing, Point } from './model';

export const UNDO_GHOST_MS = 420;

export type UndoFeedback = Readonly<{ id: number; startedAt: number; reduced: boolean }>;
// A press on Undo with nothing left to undo, answered by the unavailable cue.
export type UnavailableFeedback = Readonly<{ id: number; startedAt: number; reduced: boolean }>;
export type UndoGhost = UndoFeedback &
  Readonly<{
    before: Drawing;
    after: Drawing;
    towards: Point | null;
    onFinished: () => void;
  }>;
