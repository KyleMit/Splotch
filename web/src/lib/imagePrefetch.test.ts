// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requested: FakeImage[] = [];

class FakeImage {
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  srcset = '';
  sizes = '';
  removedAttributes: string[] = [];

  constructor() {
    requested.push(this);
  }

  removeAttribute(name: string) {
    this.removedAttributes.push(name);
    if (name === 'src') this.src = '';
    if (name === 'srcset') this.srcset = '';
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
  it('uses responsive candidates when the caller supplies them', async () => {
    const { prefetchImages } = await import('./imagePrefetch');

    prefetchImages([
      {
        src: '/coloring/farm/cat-tall.overlay.webp',
        srcset:
          '/coloring/max-1152px/farm/cat-tall.overlay.webp 768w, /coloring/farm/cat-tall.overlay.webp 1024w',
        sizes: '100vw',
      },
    ]);

    expect(requested[0]).toMatchObject({
      src: '/coloring/farm/cat-tall.overlay.webp',
      srcset:
        '/coloring/max-1152px/farm/cat-tall.overlay.webp 768w, /coloring/farm/cat-tall.overlay.webp 1024w',
      sizes: '100vw',
    });
  });

  it('cancels competing transfers while preserving the selected image', async () => {
    const { cancelImagePrefetchesExcept, prefetchImages } = await import('./imagePrefetch');

    prefetchImages(['/cover.webp', '/selected.webp']);
    cancelImagePrefetchesExcept('/selected.webp');

    expect(requested[0].removedAttributes).toEqual(['src']);
    expect(requested[1].removedAttributes).toEqual([]);
  });

  it('removes srcset when cancelling a responsive transfer', async () => {
    const { cancelImagePrefetchesExcept, prefetchImages } = await import('./imagePrefetch');

    prefetchImages([
      {
        src: '/cover.webp',
        srcset: '/small-cover.webp 200w, /cover.webp 400w',
        sizes: '100px',
      },
    ]);
    cancelImagePrefetchesExcept('/selected.webp');

    expect(requested[0].removedAttributes).toEqual(['srcset', 'src']);
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
