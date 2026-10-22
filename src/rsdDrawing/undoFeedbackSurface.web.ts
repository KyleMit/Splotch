import { createElement, useEffect, useState, type ComponentProps } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import { UNDO_GHOST_MS } from '../drawing/undoFeedback';
import type { SvgUndoGhostLayer as Ghost } from '../drawing/SvgUndoGhost';
import type { RsdUndoFeedback as Spin } from './RsdUndoFeedback';

const cue = createLazyExport(() => import('./undoFeedbackChunk.web'));
const whole = (loaded: Awaited<ReturnType<typeof cue.load>>) => loaded;

export function RsdUndoFeedback(props: ComponentProps<typeof Spin>) {
  const Loaded = useLazyValue(cue, whole, 'The Undo cue');
  return Loaded ? createElement(Loaded.RsdUndoFeedback, props) : props.children;
}

export function SvgUndoGhostLayer(props: ComponentProps<typeof Ghost>) {
  const Loaded = useLazyValue(cue, whole, 'The Undo ghost');
  const [initial] = useState(props);
  useEffect(() => {
    const finish = initial.feedback.onFinished;
    const expiry = setTimeout(
      finish,
      UNDO_GHOST_MS + initial.feedback.startedAt - performance.now()
    );
    cue.load().catch(finish);
    return () => clearTimeout(expiry);
  }, [initial]);
  return Loaded ? createElement(Loaded.SvgUndoGhostLayer, initial) : null;
}
