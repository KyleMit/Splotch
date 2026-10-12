import { afterEach, expect, it, vi } from 'vitest';
import { stubAudioContext } from './drawingSoundTestHarness';

let stopDrawSound: (() => void) | undefined;

afterEach(() => {
  stopDrawSound?.();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('plays the volume preview while only the drawing source is off', async ({ signal }) => {
  const { setDrawingSound, setSound } = await import('$lib/state/settings.svelte');
  signal.throwIfAborted();
  const drawingSound = await import('./drawingSound');
  signal.throwIfAborted();
  stopDrawSound = drawingSound.stopDrawSound;
  const sourceNode = {
    buffer: null as AudioBuffer | null,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) });
  vi.stubGlobal('fetch', fetchMock);
  stubAudioContext({ createBufferSource: vi.fn(() => sourceNode) });

  setSound(true);
  setDrawingSound(false);
  drawingSound.playVolumePreview({ speed: 0.45, isStrokeStart: true });

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  signal.throwIfAborted();
  await vi.waitFor(() => expect(sourceNode.start).toHaveBeenCalledOnce());
});
