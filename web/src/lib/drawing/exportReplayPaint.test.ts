import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRAYON_DEFAULTS, crayonOptionsSnapshot, setCrayonOptions } from './crayonBrush';
import { configureCrayonDeposition, crayonDepositionMode } from './crayonPassBuffer';
import { configureReplayCrayon, paintReplayExport } from './exportReplayPaint';
import type { ReplayPngInput } from './pngEncoderProtocol';

type Call = [name: string, ...args: unknown[]];

// Records every 2D call in order; property writes land on the target, so the renderers read back
// what they set.
function recordingContext() {
  const calls: Call[] = [];
  const state: Record<string | symbol, unknown> = {
    canvas: { width: 300, height: 150 },
    globalCompositeOperation: 'source-over',
    getTransform: () => new DOMMatrix(),
    createPattern: (...args: unknown[]) => {
      calls.push(['createPattern', ...args]);
      return { setTransform: () => {} };
    },
  };
  const context = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push([String(key), ...args]);
      };
    },
    set(target, key, value) {
      target[key] = value;
      if (key === 'globalCompositeOperation') calls.push(['composite', value]);
      return true;
    },
  });
  return { context: context as unknown as OffscreenCanvasRenderingContext2D, calls };
}

function input(overrides: Partial<ReplayPngInput> = {}): ReplayPngInput {
  const tile = { width: 64, height: 64, close: vi.fn() } as unknown as ImageBitmap;
  return {
    width: 300,
    height: 150,
    replayScale: 1.5,
    exportScale: 3,
    paper: { width: 200, height: 100 },
    base: [{ bitmap: tile, x: 64, y: 0 }],
    commands: [[{ kind: 'dot', x: 10, y: 10, radius: 4, color: '#ff0000', erase: false }]],
    sheets: [],
    crayon: { options: CRAYON_DEFAULTS, deposition: 'restamp' },
    texture: null,
    overlay: null,
    paperColor: '#fffaf0',
    preview: null,
    ...overrides,
  };
}

afterEach(() => {
  setCrayonOptions(CRAYON_DEFAULTS);
  configureCrayonDeposition('restamp');
});

describe('paintReplayExport', () => {
  it('replays base tiles, then each command clipped to the paper, then lays the paper under them', () => {
    const { context, calls } = recordingContext();
    const replay = input();

    paintReplayExport(context, replay);

    const names = calls.map(([name]) => name);
    expect(calls[0]).toEqual(['scale', 1.5, 1.5]);
    expect(calls[1]).toEqual(['drawImage', replay.base[0].bitmap, 64, 0]);
    const clip = names.indexOf('clip');
    expect(calls[names.indexOf('rect')]).toEqual(['rect', 0, 0, 200, 100]);
    expect(names.indexOf('arc')).toBeGreaterThan(clip);
    const paper = calls.findIndex(
      ([name, value]) => name === 'composite' && value === 'destination-over'
    );
    expect(paper).toBeGreaterThan(names.indexOf('arc'));
    expect(calls.slice(paper)).toContainEqual(['fillRect', 0, 0, 100, 50]);
  });

  it('draws the coloring overlay over the paper, at the export scale', () => {
    const { context, calls } = recordingContext();
    const overlay = { width: 100, height: 50, close: vi.fn() } as unknown as ImageBitmap;

    paintReplayExport(context, input({ overlay }));

    const overlayDraw = calls.findLastIndex(([name]) => name === 'drawImage');
    expect(calls[overlayDraw]).toEqual(['drawImage', overlay, 0, 0, 100, 50]);
    expect(overlayDraw).toBeGreaterThan(calls.findIndex(([name]) => name === 'fillRect'));
  });
});

describe('configureReplayCrayon', () => {
  it('applies the page realm’s tuned options and deposition', () => {
    const tuned = { ...CRAYON_DEFAULTS, colorMix: 0.3 };

    configureReplayCrayon({ options: tuned, deposition: 'glaze-direct' });

    expect(crayonOptionsSnapshot()).toEqual(tuned);
    expect(crayonDepositionMode()).toBe('glaze-direct');
  });
});
