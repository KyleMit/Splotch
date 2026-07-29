import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requested: ControllableImage[] = [];

class ControllableImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';

  constructor() {
    requested.push(this);
  }
}

beforeEach(() => {
  vi.resetModules();
  requested.length = 0;
  vi.stubGlobal('Image', ControllableImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('warmPaperTexture', () => {
  it('retries a failed load and caches the successful retry', async () => {
    const { warmPaperTexture } = await import('./exportDrawing');

    warmPaperTexture();
    warmPaperTexture();
    expect(requested).toHaveLength(1);

    requested[0].onerror!();
    warmPaperTexture();
    expect(requested).toHaveLength(2);

    requested[1].onload!();
    warmPaperTexture();
    expect(requested).toHaveLength(2);
  });
});
