// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requested: FakeImage[] = [];

class FakeImage {
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  removedAttributes: string[] = [];

  constructor() {
    requested.push(this);
  }

  removeAttribute(name: string) {
    this.removedAttributes.push(name);
    if (name === 'src') this.src = '';
  }
}

beforeEach(() => {
  vi.resetModules();
  requested.length = 0;
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('image prefetch cancellation', () => {
  it('cancels competing transfers while preserving the selected image', async () => {
    const { cancelImagePrefetchesExcept, prefetchImages } = await import('./imagePrefetch');

    prefetchImages(['/cover.webp', '/selected.webp']);
    cancelImagePrefetchesExcept('/selected.webp');

    expect(requested[0].removedAttributes).toEqual(['src']);
    expect(requested[1].removedAttributes).toEqual([]);
  });

  it('allows a cancelled image to be prefetched again', async () => {
    const { cancelImagePrefetchesExcept, prefetchImages } = await import('./imagePrefetch');

    prefetchImages(['/cover.webp', '/selected.webp']);
    cancelImagePrefetchesExcept('/selected.webp');
    prefetchImages(['/cover.webp']);
    requested[0].onerror?.();
    cancelImagePrefetchesExcept('/selected.webp');

    expect(requested).toHaveLength(3);
    expect(requested[2].removedAttributes).toEqual(['src']);
  });

  it('does not cancel an image whose transfer already completed', async () => {
    const { cancelImagePrefetchesExcept, prefetchImages } = await import('./imagePrefetch');

    prefetchImages(['/complete.webp', '/selected.webp']);
    requested[0].onload?.();
    cancelImagePrefetchesExcept('/selected.webp');

    expect(requested[0].removedAttributes).toEqual([]);
  });
});
