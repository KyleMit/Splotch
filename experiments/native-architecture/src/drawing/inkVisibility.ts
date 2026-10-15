import { useEffect, useReducer, useRef } from 'react';
import { drawingInkIdentity, type Drawing } from './model';

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

// The drawing owner's visible-ink state. An eraser lift (`erased`, called with the drawing the lift
// committed) schedules a scan of that page once the child has been idle, as shipping schedules its
// scan on an eraser lift and on nothing else. Each answer is kept per drawing, so Undo back to it
// needs no second scan, as shipping's undo restores the empty state it recorded. Erased ink no scan
// has read (a restored draft, an Undo past the scans) counts as showing, as shipping holds the page
// non-empty until a scan says otherwise.
export function useVisibleInk(drawing: Drawing, idle: boolean, scanEmpty: EmptyScan) {
  const answers = useRef(new WeakMap<Drawing, boolean>());
  const awaiting = useRef(new WeakSet<Drawing>());
  const scan = useRef(scanEmpty);
  scan.current = scanEmpty;
  const [lifts, changed] = useReducer((count: number) => count + 1, 0);
  const verdict = inkVerdict(drawing);
  useEffect(() => {
    const identity = drawingInkIdentity(drawing);
    if (!idle || !awaiting.current.has(drawing) || answers.current.has(identity)) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    function settle(visible: boolean) {
      awaiting.current.delete(drawing);
      answers.current.set(identity, visible);
      changed();
    }
    function wait() {
      timer = setTimeout(() => {
        void scan.current(drawing).then(
          (empty) => {
            if (!live) return;
            if (empty === 'busy') return wait();
            settle(!empty);
          },
          () => {
            // A page the scan cannot read keeps counting as inked rather than retrying forever.
            if (live) settle(true);
          }
        );
      }, EMPTY_SCAN_IDLE_MS);
    }
    wait();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [drawing, idle, lifts]);
  return {
    visible:
      verdict === 'scan'
        ? (answers.current.get(drawingInkIdentity(drawing)) ?? true)
        : verdict === 'inked',
    empty(snapshot: Drawing): boolean | undefined {
      const known = inkVerdict(snapshot);
      if (known !== 'scan') return known === 'blank';
      const visible = answers.current.get(drawingInkIdentity(snapshot));
      return visible === undefined ? undefined : !visible;
    },
    erased(lifted: Drawing) {
      if (inkVerdict(lifted) !== 'scan') return;
      awaiting.current.add(lifted);
      changed();
    },
  };
}
