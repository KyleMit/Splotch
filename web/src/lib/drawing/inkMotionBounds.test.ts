// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { paintStrokeFootprint, strokeGhostReadsTiles, strokeMotionBounds } from './inkMotionBounds';
import { AA_PAD_PX } from './opGeometry';
import type { DotOp, StrokeGroupCommand } from './strokeOps';

const dot: DotOp = { kind: 'dot', x: 40, y: 60, radius: 12, color: '#ff0000', erase: false };

describe('strokeMotionBounds', () => {
  it('includes stroke width, antialiasing, and outlying curve control points', () => {
    const command: StrokeGroupCommand = {
      wasEmpty: true,
      ops: [
        dot,
        { kind: 'crayonFlush' },
        {
          kind: 'path',
          pid: 0,
          startX: 40,
          startY: 60,
          segs: [{ cx: 100, cy: 10, x: 80, y: 70 }],
          color: '#ff0000',
          lineWidth: 8,
          erase: false,
        },
      ],
    };
    expect(strokeMotionBounds(command, 200, 200)).toEqual({
      left: 26,
      top: 4,
      width: 80,
      height: 72,
    });
  });

  it('rounds outwards and clips partially visible ink to paper edges', () => {
    expect(
      strokeMotionBounds(
        { wasEmpty: true, ops: [{ ...dot, x: 1.5, y: 99.5, radius: 4 }] },
        100,
        100
      )
    ).toEqual({ left: 0, top: 93, width: 8, height: 7 });
  });

  it('omits entirely off-paper ink', () => {
    expect(strokeMotionBounds({ wasEmpty: true, ops: [{ ...dot, x: -100 }] }, 100, 100)).toBeNull();
  });

  it('omits commands with no ink geometry', () => {
    expect(
      strokeMotionBounds({ wasEmpty: true, ops: [{ kind: 'crayonFlush' }] }, 100, 100)
    ).toBeNull();
  });

  it.each<StrokeGroupCommand>([
    { wasEmpty: false, ops: [{ ...dot, erase: true }] },
    { wasEmpty: false, ops: [{ kind: 'clear' }] },
    {
      wasEmpty: false,
      ops: [dot],
      magicRecode: {
        targetSourceKey: null,
        previousSheets: new Map(),
        restoreAppearance: vi.fn(),
        applied: true,
      },
    },
  ])('omits history commands that restore appearance', (command) => {
    expect(strokeMotionBounds(command, 100, 100)).toBeNull();
  });
});

describe('paintStrokeFootprint', () => {
  function recordingContext() {
    const calls: { kind: 'arc' | 'stroke'; radius?: number; lineWidth?: number }[] = [];
    let lineWidth = 0;
    const target = {
      lineCap: 'butt',
      lineJoin: 'miter',
      fillStyle: '',
      strokeStyle: '',
      get lineWidth() {
        return lineWidth;
      },
      set lineWidth(value: number) {
        lineWidth = value;
      },
      beginPath: () => {},
      moveTo: () => {},
      quadraticCurveTo: () => {},
      arc: (_x: number, _y: number, radius: number) => calls.push({ kind: 'arc', radius }),
      fill: () => {},
      stroke: () => calls.push({ kind: 'stroke', lineWidth }),
    };
    return { target: target as unknown as CanvasRenderingContext2D, calls, target_: target };
  }

  it('pads every ink op by the renderer AA bleed and skips erase and non-ink ops', () => {
    const { target, calls, target_ } = recordingContext();
    paintStrokeFootprint(target, {
      wasEmpty: true,
      ops: [
        dot,
        { ...dot, erase: true },
        { kind: 'crayonFlush' },
        {
          kind: 'path',
          pid: 0,
          startX: 0,
          startY: 0,
          segs: [{ cx: 5, cy: 5, x: 10, y: 10 }],
          color: '#ff0000',
          lineWidth: 8,
          erase: false,
          crayon: true,
        },
      ],
    });
    expect(calls).toEqual([
      { kind: 'arc', radius: dot.radius + AA_PAD_PX },
      { kind: 'stroke', lineWidth: 8 + 2 * AA_PAD_PX },
    ]);
    expect(target_.lineCap).toBe('round');
    expect(target_.lineJoin).toBe('round');
  });
});

describe('strokeGhostReadsTiles', () => {
  it('reads the tiles for crayon and magic ink and replays plain pen ink', () => {
    expect(strokeGhostReadsTiles({ wasEmpty: true, ops: [dot] })).toBe(false);
    expect(strokeGhostReadsTiles({ wasEmpty: true, ops: [dot, { ...dot, crayon: true }] })).toBe(
      true
    );
    expect(strokeGhostReadsTiles({ wasEmpty: true, ops: [{ ...dot, magic: true }] })).toBe(true);
    expect(
      strokeGhostReadsTiles({ wasEmpty: true, ops: [{ ...dot, crayon: true, erase: true }] })
    ).toBe(false);
  });
});
