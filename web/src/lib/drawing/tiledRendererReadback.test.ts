import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StrokeGroupCommand, StrokeOp } from './strokeOps';

// renderOp is stubbed rather than exercised: the assertion here is about which
// commands get wrapped in the paper clip, and the real renderOp would drive
// canvas calls happy-dom cannot rasterize anyway.
vi.mock('./strokeOps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strokeOps')>()),
  renderOp: vi.fn(),
}));

import { renderOp } from './strokeOps';
import { renderTiledReadback } from './tiledRendererReadback';

const PAPER = { width: 100, height: 50 };

function recordingTarget() {
  const clipRects: string[] = [];
  let pendingRect = '';
  const target = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: (_x: number, _y: number, width: number, height: number) => {
      pendingRect = `${width}x${height}`;
    },
    clip: () => clipRects.push(pendingRect),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { target, clipRects };
}

function command(): StrokeGroupCommand {
  return { ops: [{ kind: 'dot' } as unknown as StrokeOp] } as StrokeGroupCommand;
}

beforeEach(() => vi.mocked(renderOp).mockClear());

describe('renderTiledReadback', () => {
  it('clips the in-flight stroke to the paper, exactly as a committed one', () => {
    const { target, clipRects } = recordingTarget();

    renderTiledReadback(target, [], [command()], command(), PAPER);

    // Two clips, not one: an export taken mid-stroke must not show ink that the
    // same stroke loses the instant it commits.
    expect(clipRects).toEqual(['100x50', '100x50']);
    expect(renderOp).toHaveBeenCalledTimes(2);
  });

  it('paints nothing from either command when the paper has no size', () => {
    const { target, clipRects } = recordingTarget();

    renderTiledReadback(target, [], [command()], command(), null);

    expect(clipRects).toEqual([]);
    expect(renderOp).not.toHaveBeenCalled();
  });
});
