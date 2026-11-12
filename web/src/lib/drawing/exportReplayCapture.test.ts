// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRAYON_DEFAULTS } from './crayonBrush';
import { captureReplay, closeReplayCapture, serializeReplayCommands } from './exportReplayCapture';
import { restoreReplayOp } from './exportReplayPaint';
import type { MagicSheetSnapshot } from './magicBrush';
import type { StrokeOp } from './strokeOps';

function sheet(name: string): MagicSheetSnapshot {
  return {
    canvas: { name } as unknown as ImageBitmap,
    originX: 4,
    originY: 8,
    sourceUrl: `/${name}.svg`,
  };
}

const pen: StrokeOp = { kind: 'dot', x: 1, y: 2, radius: 3, color: '#f00', erase: false };

function magicPath(magicSheet?: MagicSheetSnapshot): StrokeOp {
  return {
    kind: 'path',
    pid: 1,
    startX: 0,
    startY: 0,
    segs: [{ cx: 1, cy: 1, x: 2, y: 2 }],
    color: '#000',
    lineWidth: 6,
    erase: false,
    magic: true,
    ...(magicSheet ? { magicSheet } : {}),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('serializeReplayCommands', () => {
  it('passes non-Magic ops through by reference and names each colour sheet once', () => {
    const page = sheet('page');
    const { commands, sheets } = serializeReplayCommands(
      [
        [pen, magicPath(page)],
        [magicPath(page), { kind: 'crayonFlush' }],
      ],
      null
    );

    expect(sheets).toEqual([page]);
    expect(commands[0][0]).toBe(pen);
    expect(commands[0][1]).toMatchObject({ kind: 'path', magic: true, sheet: 0 });
    expect(commands[1][0]).toMatchObject({ sheet: 0 });
    expect(commands[1][1]).toEqual({ kind: 'crayonFlush' });
  });

  it('gives a Magic op recorded before its sheet decoded the live sheet, as renderOp would', () => {
    const live = sheet('live');
    const { commands, sheets } = serializeReplayCommands([[magicPath()]], live);

    expect(sheets).toEqual([live]);
    expect(commands[0][0]).toMatchObject({ sheet: 0 });
  });

  it('leaves a Magic op with no sheet at all unnamed, so the worker paints nothing for it', () => {
    const { commands, sheets } = serializeReplayCommands([[magicPath()]], null);

    expect(sheets).toEqual([]);
    expect(commands[0][0]).not.toHaveProperty('sheet');
    expect(commands[0][0]).not.toHaveProperty('magicSheet');
  });

  it('produces commands the structured clone accepts', () => {
    const live = { ...sheet('live'), canvas: new ArrayBuffer(4) as unknown as ImageBitmap };
    const canvasHolder = { ...sheet('own'), canvas: (() => {}) as unknown as ImageBitmap };
    const { commands } = serializeReplayCommands([[pen, magicPath(canvasHolder)]], live);

    expect(() => structuredClone(commands)).not.toThrow();
  });

  it('is undone by restoreReplayOp, which hands each op its sheet back', () => {
    const page = sheet('page');
    const original = magicPath(page);
    const { commands, sheets } = serializeReplayCommands([[original, pen]], null);

    const restored = commands[0].map((op) => restoreReplayOp(op, sheets));

    expect(restored[0]).toMatchObject({ ...original, magicSheet: page });
    expect(restored[1]).toBe(pen);
  });
});

describe('captureReplay', () => {
  it('copies every base tile and sheet when called, and closes them through the capture', async () => {
    const made: Array<{ source: unknown; close: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (source: unknown) => {
        const bitmap = { source, close: vi.fn() };
        made.push(bitmap);
        return bitmap;
      })
    );
    const tile = { id: 'tile' } as unknown as HTMLCanvasElement;
    const page = sheet('page');

    const capture = captureReplay({
      base: [{ canvas: tile, x: 256, y: 0 }],
      commands: [[magicPath(page)]],
      liveSheet: null,
      paper: { width: 600, height: 400 },
    });

    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(capture.base).toEqual([{ bitmap: expect.any(Promise), x: 256, y: 0 }]);
    expect(capture.sheets).toEqual([
      { bitmap: expect.any(Promise), originX: 4, originY: 8, sourceUrl: '/page.svg' },
    ]);
    expect(capture.paper).toEqual({ width: 600, height: 400 });
    expect(capture.crayon).toEqual({ options: CRAYON_DEFAULTS, deposition: 'restamp' });

    closeReplayCapture(capture);
    await vi.waitFor(() =>
      expect(made.map((bitmap) => bitmap.close.mock.calls.length)).toEqual([1, 1])
    );
    expect(made.map((bitmap) => bitmap.source)).toEqual([tile, page.canvas]);
  });
});
