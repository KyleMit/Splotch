// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { strokeMotionBounds } from './inkMotionBounds';
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
