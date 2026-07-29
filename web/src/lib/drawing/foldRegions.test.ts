import { describe, it, expect, vi } from 'vitest';
import type { PathOp } from './strokeOps';
import { foldRegionsForCommands, MERGE_INPUT_CAP } from './foldRegions';

describe('dirty-rect patch snapshots', () => {
  // A snapshot captures only the paper under the regions its fold mutates
  // (foldRegionsForCommands), so per-entry memory scales with the stroke, not
  // the canvas.

  it('bounds a path by its points padded with half the line width plus AA bleed', () => {
    const op: PathOp = {
      kind: 'path',
      pid: 1,
      startX: 20,
      startY: 30,
      segs: [{ cx: 24, cy: 34, x: 28, y: 38 }],
      color: '#a',
      lineWidth: 8,
      erase: false,
    };
    // pad = 8/2 + 2 = 6: x spans 20−6..28+6, y spans 30−6..38+6.
    expect(foldRegionsForCommands([{ ops: [op], wasEmpty: false }], 64, 64)).toEqual({
      rects: [{ x: 14, y: 24, w: 20, h: 20 }],
      wipesPaper: false,
    });
  });

  it('bounds a dot by its radius plus AA bleed and clamps to the paper', () => {
    const dot = { kind: 'dot' as const, x: 2, y: 62, radius: 5, color: '#a', erase: false };
    // pad = 5 + 2 = 7: clamped at the left and bottom paper edges.
    expect(foldRegionsForCommands([{ ops: [dot], wasEmpty: false }], 64, 64)).toEqual({
      rects: [{ x: 0, y: 55, w: 9, h: 9 }],
      wipesPaper: false,
    });
  });

  it('a clear claims the whole paper; wholly off-paper ink claims nothing', () => {
    expect(foldRegionsForCommands([{ ops: [{ kind: 'clear' }], wasEmpty: false }], 64, 64)).toEqual(
      { rects: [{ x: 0, y: 0, w: 64, h: 64 }], wipesPaper: true }
    );
    // Margin ink beyond the paper square is clipped at fold (ADR-0050), so the
    // fold never touches the paper and no patch is owed.
    const off = { kind: 'dot' as const, x: -40, y: 10, radius: 5, color: '#a', erase: false };
    expect(foldRegionsForCommands([{ ops: [off], wasEmpty: false }], 64, 64)).toEqual({
      rects: [],
      wipesPaper: false,
    });
    expect(foldRegionsForCommands([], 64, 64)).toEqual({ rects: [], wipesPaper: false });
  });

  it('bounds a crayon pass raster by its rect plus AA bleed', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 12;
    const raster = { kind: 'crayonPassRaster', canvas, x: 20, y: 30, mix: 0.55 } as const;
    // The stamp blits exactly the raster's rect; pad 2 covers any AA bleed.
    expect(foldRegionsForCommands([{ ops: [raster], wasEmpty: false }], 64, 64)).toEqual({
      rects: [{ x: 18, y: 28, w: 14, h: 16 }],
      wipesPaper: false,
    });
  });

  it('widens a crayon ink op pad by the widest dev-harness pass', async () => {
    // setCrayonParams accepts arbitrary passes; a widthScale > 1 experiment
    // strokes wider than the op's line width, so the rect must scale with it
    // or undo would leave the widened fringe behind.
    //
    // crayonBrush's options are module state with no reset seam, so this test
    // works on a fresh module graph rather than leaking the widened pass into
    // the statically imported one every other test here reads.
    vi.resetModules();
    const { foldRegionsForCommands: foldRegions } = await import('./foldRegions');
    const { setCrayonOptions } = await import('./crayonBrush');
    setCrayonOptions({ passes: [{ widthScale: 2, coverage: 1 }] });
    const op: PathOp = {
      kind: 'path',
      pid: 1,
      startX: 0,
      startY: 0,
      segs: [{ cx: 0, cy: 0, x: 1, y: 1 }],
      color: '#wax',
      lineWidth: 8,
      erase: false,
      crayon: true,
    };
    // pad = (8/2)×2 + 2 = 10 (vs 6 at base width): span 0..1 grows to 0..11.
    expect(foldRegions([{ ops: [op], wasEmpty: false }], 64, 64)).toEqual({
      rects: [{ x: 0, y: 0, w: 11, h: 11 }],
      wipesPaper: false,
    });
  });
});

describe('disjoint multi-finger patches', () => {
  it('skips the merge fixpoint entirely past the raw-cluster input cap', () => {
    const groupCount = 4;
    // More than the raw-cluster cap form four separated overlapping groups.
    // The fixpoint would return four patches, but the input cap returns one union.
    const dots = Array.from({ length: MERGE_INPUT_CAP + 1 }, (_, i) => ({
      kind: 'dot' as const,
      x: 10 + Math.floor(i / groupCount) * 4,
      y: 10 + (i % groupCount) * 10,
      radius: 1,
      color: '#swarm',
      erase: false,
    }));
    expect(
      foldRegionsForCommands(
        [{ ops: dots, wasEmpty: true }],
        (MERGE_INPUT_CAP + 2) * 10,
        (groupCount + 1) * 10
      )
    ).toEqual({
      rects: [
        {
          x: 7,
          y: 7,
          w: Math.ceil((MERGE_INPUT_CAP + 1) / groupCount) * 4 + 2,
          h: groupCount * 10 - 4,
        },
      ],
      wipesPaper: false,
    });
  });
});
