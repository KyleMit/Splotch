// The baseline — the crayon Splotch ships today, unchanged.
//
// This is not a reimplementation for comparison's sake: it builds the same
// `path` ops the engine records and hands them to the same `renderOp`, so the
// wax that lands here goes through crayonBrush's colorized pattern tiles and
// crayonPassBuffer's deposition pipeline exactly as it does in production. The
// only thing the harness supplies is the geometry the pointer would have.
//
// The canvas is left TRANSPARENT with the paper colour behind it in CSS,
// because that is the stack the crayon is tuned against (ADR-0050) and the
// glaze reads differently over an opaque target. Which makes this baseline a
// second, quieter datapoint: a GPU option folds the paper INTO the canvas, and
// the two screenshots sitting side by side are what that looks like.

import { renderOp } from '../../strokeOps';
import type { PathSeg, StrokeOp } from '../../strokeOps';
import type { CrayonRenderer, PaintStats, StrokeStyle } from '../renderer';

export function createCpuRenderer(canvas: HTMLCanvasElement): CrayonRenderer {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('cpu renderer could not acquire a 2d context');

  // Mirrors strokeSmoothSegments' PointerState: the last raw point is the next
  // segment's control, the last midpoint is where the next segment starts.
  let lastX = 0;
  let lastY = 0;
  let midX = 0;
  let midY = 0;
  let started = false;

  return {
    canvas,
    id: 'cpu',
    label: 'CPU baseline (shipping)',
    blurb:
      'The crayon in production today: midpoint-quadratic path ops through renderOp, colorized wax tiles from crayonBrush, deposited by crayonPassBuffer onto a 2D canvas.',
    primitiveNoun: 'segments',

    clear() {
      renderOp(context, { kind: 'clear' });
      started = false;
    },

    beginStroke() {
      started = false;
    },

    endStroke() {
      renderOp(context, { kind: 'crayonFlush' });
    },

    beginFrame() {},
    endFrame() {},

    paint(points: Float32Array, pointCount: number, style: StrokeStyle): PaintStats {
      let from = 1;
      if (!started) {
        lastX = points[0];
        lastY = points[1];
        midX = lastX;
        midY = lastY;
        started = true;
      }
      const segs: PathSeg[] = [];
      for (let i = from; i < pointCount; i++) {
        const x = points[i * 2];
        const y = points[i * 2 + 1];
        const nextMidX = (lastX + x) / 2;
        const nextMidY = (lastY + y) / 2;
        segs.push({ cx: lastX, cy: lastY, x: nextMidX, y: nextMidY });
        lastX = x;
        lastY = y;
      }
      if (segs.length === 0) return { drawCalls: 0, primitives: 0 };

      const op: StrokeOp = {
        kind: 'path',
        pid: 0,
        startX: midX,
        startY: midY,
        segs,
        color: style.color,
        lineWidth: style.widthPx,
        erase: false,
        crayon: true,
        seed: style.seed,
      };
      midX = segs[segs.length - 1].x;
      midY = segs[segs.length - 1].y;

      renderOp(context, op);
      return { drawCalls: 1, primitives: segs.length };
    },

    dispose() {},
  };
}
