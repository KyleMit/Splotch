import { beforeEach, expect, it, vi } from 'vitest';

import type { BrushType } from '$lib/state/tool.svelte';

const engineCalls = vi.hoisted(() => [] as string[]);
const toolState = vi.hoisted(() => ({ brush: 'pen' as BrushType }));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/audio/drawingSound', () => ({
  playDrawSound: vi.fn(),
  preloadFirstDrawSound: vi.fn(),
  stopDrawSound: vi.fn(),
}));
vi.mock('$lib/state/colors.svelte', () => ({ colorsState: { activeColor: '#2c5faa' } }));
vi.mock('$lib/state/strokeWidth.svelte', () => ({
  activeStrokeSize: () => 3,
  getStrokeWidthPx: () => 12,
}));
vi.mock('$lib/state/tool.svelte', () => ({ toolState }));
vi.mock('./engine', () => ({
  engineOwnsCanvas: () => false,
  initDrawingCanvas: (_canvas: HTMLCanvasElement, options: { initialColor: string }) => {
    engineCalls.push(`init:${options.initialColor}`);
  },
  setStrokeWidth: (widthPx: number) => {
    engineCalls.push(`width:${widthPx}`);
  },
  setBrush: (brush: BrushType) => {
    engineCalls.push(`brush:${brush}`);
  },
}));

beforeEach(() => {
  vi.resetModules();
  engineCalls.length = 0;
  document.body.innerHTML = '';
});

// setBrush has to follow init: crayon warms the colour init sets, and magic
// locks its rainbow onto the paper init sizes.
it.each(['crayon', 'magic'] as const)(
  'boot restores a persisted %s with one brush push after init',
  async (brush) => {
    toolState.brush = brush;
    document.body.innerHTML = '<canvas id="drawingCanvas"></canvas>';

    await import('./earlyBoot');

    expect(engineCalls).toEqual(['init:#2c5faa', 'width:12', `brush:${brush}`]);
  }
);

it('pushes the eraser through the same single brush push as every other brush', async () => {
  const { pushToolStateToEngine } = await import('./earlyBoot');
  toolState.brush = 'eraser';

  pushToolStateToEngine();

  expect(engineCalls).toEqual(['width:12', 'brush:eraser']);
});
