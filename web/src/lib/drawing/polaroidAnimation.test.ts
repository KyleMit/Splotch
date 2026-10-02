import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POLAROID_CLEANUP_TIMEOUT_MS } from './screenshotTiming';
import { applyReducedMotion, START_REDUCED_MOTION_ATTRIBUTE } from '$lib/platform/reducedMotion';

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
  applyReducedMotion(false);
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

    const flash = document.querySelector('.polaroid-flash');
    expect(flash).not.toBeNull();
    flash?.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }));
    expect(document.querySelector('.polaroid-flash')).toBeNull();
    expect(frame?.isConnected).toBe(true);
    expect(canvas?.isConnected).toBe(true);

    frame?.dispatchEvent(new AnimationEvent('animationend'));
    expect(document.querySelector('.polaroid-overlay')).toBeNull();
  });

  it('omits the invisible flash while retaining the reduced-motion preview', async () => {
    applyReducedMotion(true);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const preview = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    createPolaroidPreviewRequest()?.onReady(preview);

    const frame = document.querySelector('.polaroid-frame');
    expect(document.querySelector('.polaroid-flash')).toBeNull();
    expect(frame?.hasAttribute(START_REDUCED_MOTION_ATTRIBUTE)).toBe(true);
    expect(document.querySelector('.polaroid-image')).not.toBeNull();
    expect(drawImage).toHaveBeenCalledWith(preview, 0, 0);
    expect(preview.close).toHaveBeenCalledOnce();

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
    const canvas = document.querySelector('.polaroid-image');
    document.querySelector('.polaroid-flash')?.dispatchEvent(new AnimationEvent('animationend'));
    request?.onReady(corrected);

    expect(document.querySelectorAll('.polaroid-overlay')).toHaveLength(1);
    expect(document.querySelectorAll('.polaroid-image')).toHaveLength(1);
    expect(document.querySelector('.polaroid-image')).toBe(canvas);
    expect(document.querySelector('.polaroid-flash')).toBeNull();
    expect(drawImage).toHaveBeenNthCalledWith(1, first, 0, 0);
    expect(drawImage).toHaveBeenNthCalledWith(2, corrected, 0, 0);
    expect(first.close).toHaveBeenCalledOnce();
    expect(corrected.close).toHaveBeenCalledOnce();
  });

  it('fades a discarded polaroid out and lets its cleanup timer remove it', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const preview = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    const request = createPolaroidPreviewRequest();
    request?.onReady(preview);
    request?.discard();

    expect(document.querySelector('.polaroid-overlay')?.classList).toContain('polaroid-discarded');
    vi.advanceTimersByTime(POLAROID_CLEANUP_TIMEOUT_MS);
    expect(document.querySelector('.polaroid-overlay')).toBeNull();
  });

  it('never mounts a polaroid whose preview arrives after it was discarded', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const preview = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    const request = createPolaroidPreviewRequest();
    if (!request) throw new Error('Expected a polaroid preview request');
    request.discard();
    request.onReady(preview);

    expect(document.querySelector('.polaroid-overlay')).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(preview.close).toHaveBeenCalledOnce();
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
    document.querySelector('.polaroid-flash')?.dispatchEvent(new AnimationEvent('animationend'));
    expect(document.querySelector('.polaroid-flash')).toBeNull();

    vi.advanceTimersByTime(POLAROID_CLEANUP_TIMEOUT_MS);
    expect(document.querySelector('.polaroid-overlay')).toBeNull();
  });

  it('closes a preview arriving after frame cleanup without resurrecting the flash', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const first = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const late = { width: 960, height: 720, close: vi.fn() } as unknown as ImageBitmap;
    const { createPolaroidPreviewRequest } = await import('./polaroidAnimation');

    const request = createPolaroidPreviewRequest();
    request?.onReady(first);
    document.querySelector('.polaroid-flash')?.dispatchEvent(new AnimationEvent('animationend'));
    document.querySelector('.polaroid-frame')?.dispatchEvent(new AnimationEvent('animationend'));
    request?.onReady(late);

    expect(document.querySelector('.polaroid-overlay')).toBeNull();
    expect(document.querySelector('.polaroid-flash')).toBeNull();
    expect(document.querySelector('.polaroid-image')).toBeNull();
    expect(drawImage).toHaveBeenCalledOnce();
    expect(first.close).toHaveBeenCalledOnce();
    expect(late.close).toHaveBeenCalledOnce();
  });
});
