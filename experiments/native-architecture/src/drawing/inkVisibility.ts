import { useEffect, useReducer, useRef } from 'react';
import type { Drawing } from './model';

// Shipping's idleEmptyScan.ts EMPTY_SCAN_IDLE_MS: the eraser's "is the page blank now?" pixel scan
// waits until the child has stopped this long, so it never lands in the frames of a scribble.
// tools/tests/native-ink-visibility.test.mjs holds it to the shipping source.
export const EMPTY_SCAN_IDLE_MS = 400;

// Whether a drawing shows ink, decided the way the shipping engine decides canvasEmpty: a page
// with no strokes but the eraser's is blank, a page with ink and no eraser shows that ink, and
// only ink the eraser has worked over needs its pixels read.
export type InkVerdict = 'blank' | 'inked' | 'scan';

export function inkVerdict(drawing: Drawing): InkVerdict {
  const inked = drawing.strokes.some((stroke) => stroke.brush !== 'eraser');
  if (!inked) return 'blank';
  return drawing.strokes.some((stroke) => stroke.brush === 'eraser') ? 'scan' : 'inked';
}

// A scan's answer: whether the page reads blank, or that it could not run just now (a command or
// a contact holds the paper) and should be tried again after another idle wait.
export type EmptyScan = (drawing: Drawing) => Promise<boolean | 'busy'>;

// The drawing owner's visible-ink state. Each scanned drawing keeps its answer, so Undo back to it
// needs no second scan; until a drawing's scan lands it counts as showing ink, as shipping holds
// the page non-empty from the stroke until its scan.
export function useVisibleInk(drawing: Drawing, idle: boolean, scanEmpty: EmptyScan) {
  const answers = useRef(new WeakMap<Drawing, boolean>());
  const scan = useRef(scanEmpty);
  scan.current = scanEmpty;
  const [, answered] = useReducer((count: number) => count + 1, 0);
  const verdict = inkVerdict(drawing);
  const needsScan = verdict === 'scan' && !answers.current.has(drawing);
  useEffect(() => {
    if (!needsScan || !idle) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    function wait() {
      timer = setTimeout(() => {
        void scan.current(drawing).then(
          (empty) => {
            if (!live) return;
            if (empty === 'busy') return wait();
            answers.current.set(drawing, !empty);
            answered();
          },
          () => {
            // A page the scan cannot read keeps counting as inked rather than retrying forever.
            if (!live) return;
            answers.current.set(drawing, true);
            answered();
          }
        );
      }, EMPTY_SCAN_IDLE_MS);
    }
    wait();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [drawing, needsScan, idle]);
  if (verdict !== 'scan') return verdict === 'inked';
  return answers.current.get(drawing) ?? true;
}
