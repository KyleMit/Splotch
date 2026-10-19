import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ViewInstance } from 'react-native';
import { undoDrawing, type History, type Point } from './drawing/model';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import type { UndoFeedback, UndoGhost } from './drawing/undoFeedback';
import { measurePaper } from './drawing/measurePaper';

type UndoActionOwner = {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  command: RefObject<boolean>;
  blocked: () => boolean;
  inputActive: () => boolean;
  setNotice: (notice: string) => void;
  report: (error: unknown) => void;
};

export function useUndoAction(owner: UndoActionOwner) {
  const current = useRef(owner);
  current.current = owner;
  const life = useRef({ alive: true, epoch: 0, blocked: false, inputActive: false });
  const blocked = owner.command.current || owner.blocked();
  const inputActive = owner.inputActive();
  if (life.current.blocked !== blocked || life.current.inputActive !== inputActive) {
    life.current.blocked = blocked;
    life.current.inputActive = inputActive;
    life.current.epoch += 1;
  }
  useEffect(() => {
    const lifetime = life.current;
    lifetime.alive = true;
    return () => {
      lifetime.alive = false;
      lifetime.epoch += 1;
    };
  }, []);
  const [undoFeedback, setUndoFeedback] = useState<UndoFeedback | null>(null);
  const [undoGhost, setUndoGhost] = useState<UndoGhost | null>(null);
  useEffect(() => {
    if (inputActive) setUndoGhost(null);
  }, [inputActive]);
  const finishGhost = useCallback((id: number) => {
    if (life.current.alive) setUndoGhost((cue) => (cue?.id === id ? null : cue));
  }, []);
  const undoTile = useRef<ViewInstance>(null);
  const nextId = useRef(0);
  const undo = useCallback(
    (reduced: boolean, towards: Point | null) => {
      const active = current.current;
      if (!life.current.alive || active.command.current || active.blocked()) return;
      const before = active.historyRef.current;
      const after = undoDrawing(before);
      if (after === before) return;
      let release: (() => void) | undefined;
      try {
        release = active.surface.current?.lockInput('undo');
        const animate = !active.inputActive();
        const startedAt = animate ? performance.now() : 0;
        active.setHistory(after);
        if (animate) {
          nextId.current += 1;
          const feedback = { id: nextId.current, startedAt, reduced };
          const ghost = {
            ...feedback,
            before: before.drawing,
            after: after.drawing,
            towards,
            onFinished: () => finishGhost(feedback.id),
          };
          setUndoFeedback(feedback);
          setUndoGhost(reduced ? null : ghost);
        } else setUndoGhost(null);
        active.setNotice('');
      } catch (error) {
        active.report(error);
      } finally {
        release?.();
      }
    },
    [finishGhost]
  );
  const undoFromButton = useCallback(
    (reduced: boolean) => {
      const requested = life.current.epoch;
      const history = current.current.historyRef.current;
      if (!life.current.alive || current.current.command.current || current.current.blocked())
        return;
      measurePaper(undoTile.current, (frame) => {
        if (life.current.epoch !== requested || current.current.historyRef.current !== history)
          return;
        undo(
          reduced,
          frame ? { x: frame.pageX + frame.width / 2, y: frame.pageY + frame.height / 2 } : null
        );
      });
    },
    [undo]
  );
  return { undo, undoFromButton, undoFeedback, undoGhost, undoTile };
}
