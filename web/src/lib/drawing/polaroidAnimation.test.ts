import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POLAROID_CLEANUP_TIMEOUT_MS } from './screenshotTiming';

const mocks = vi.hoisted(() => ({
  getViewState: vi.fn(),
}));

vi.mock('./engine', () => ({ getViewState: mocks.getViewState }));

beforeEach(() => {
  mocks.getViewState.mockReturnValue({ paperCssWidth: 1_024, paperCssHeight: 768 });
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 1_024 },
    innerHeight: { configurable: true, value: 768 },
    devicePixelRatio: { configurable: true, value: 2 },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createPolaroidPreviewRequest', () => {
  it('mounts and removes the worker preview as a bounded decorative canvas', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const button = document.createElement('button');
    button.id = 'screenshotButton';
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      left: 900,
      right: 960,
      top: 650,
      bottom: 710,
      width: 60,
      height: 60,
      x: 900,
      y: 650,
      toJSON: vi.fn(),
    });
    document.body.appendChild(button);
    const preview = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    const request = createPolaroidPreviewRequest();
    request?.onReady(preview);

    expect(request?.width).toBe(960);
    expect(drawImage).toHaveBeenCalledWith(preview, 0, 0);
    expect(preview.close).toHaveBeenCalledOnce();
    const frame = document.querySelector<HTMLElement>('.polaroid-frame');
    const canvas = document.querySelector<HTMLCanvasElement>('.polaroid-image');
    expect(frame?.style.getPropertyValue('--from-x')).toBe('418px');
    expect(frame?.style.getPropertyValue('--from-y')).toBe('296px');
    expect(canvas).toMatchObject({ width: 960, height: 720 });
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.style.width).toBe('480px');
    expect(canvas?.style.height).toBe('360px');

    frame?.dispatchEvent(new AnimationEvent('animationend'));
    expect(document.querySelector('.polaroid-overlay')).toBeNull();
  });

  it('skips the preview when the paper has no layout yet', async () => {
    mocks.getViewState.mockReturnValue({ paperCssWidth: 0, paperCssHeight: 0 });
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    expect(createPolaroidPreviewRequest()).toBeNull();
  });

  it('repaints the mounted polaroid when recovery delivers a corrected preview', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const first = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const corrected = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    const request = createPolaroidPreviewRequest();
    request?.onReady(first);
    request?.onReady(corrected);

    expect(document.querySelectorAll('.polaroid-overlay')).toHaveLength(1);
    expect(document.querySelectorAll('.polaroid-image')).toHaveLength(1);
    expect(drawImage).toHaveBeenNthCalledWith(1, first, 0, 0);
    expect(drawImage).toHaveBeenNthCalledWith(2, corrected, 0, 0);
    expect(first.close).toHaveBeenCalledOnce();
    expect(corrected.close).toHaveBeenCalledOnce();
  });

  it('removes the preview when the frame animation does not finish', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const preview = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    createPolaroidPreviewRequest()?.onReady(preview);
    expect(document.querySelector('.polaroid-overlay')).not.toBeNull();

    vi.advanceTimersByTime(POLAROID_CLEANUP_TIMEOUT_MS);
    expect(document.querySelector('.polaroid-overlay')).toBeNull();
  });
});
