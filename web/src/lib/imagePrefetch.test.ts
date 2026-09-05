// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requested: FakeImage[] = [];

interface DeferredDecode {
  resolve: () => void;
  reject: () => void;
}

class FakeImage {
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  srcset = '';
  sizes = '';
  removedAttributes: string[] = [];
  decodeCalls = 0;
  deferredDecode: DeferredDecode | null = null;

  constructor() {
    requested.push(this);
  }

  removeAttribute(name: string) {
    this.removedAttributes.push(name);
    if (name === 'src') this.src = '';
    if (name === 'srcset') this.srcset = '';
  }

  decode() {
    this.decodeCalls += 1;
    return new Promise<void>((resolve, reject) => {
      this.deferredDecode = { resolve, reject };
    });
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

  it('allows a cancelled decode to be retried immediately', async () => {
    const { cancelImagePrefetchesExcept, predecodeImage } = await import('./imagePrefetch');

    predecodeImage('/cover.webp');
    cancelImagePrefetchesExcept('/selected.webp');
    predecodeImage('/cover.webp');

    expect(requested).toHaveLength(2);
    expect(requested[1].decodeCalls).toBe(1);
  });

  it('does not cancel an image whose transfer already completed', async () => {
    const { cancelImagePrefetchesExcept, prefetchImages } = await import('./imagePrefetch');

    prefetchImages(['/complete.webp', '/selected.webp']);
    requested[0].onload?.();
    cancelImagePrefetchesExcept('/selected.webp');

    expect(requested[0].removedAttributes).toEqual([]);
  });

  it('keeps an in-flight decode cancellable until its transfer completes', async () => {
    const { cancelImagePrefetchesExcept, predecodeImage } = await import('./imagePrefetch');

    predecodeImage('/selected.svg');
    cancelImagePrefetchesExcept('/other.svg');

    expect(requested[0].decodeCalls).toBe(1);
    expect(requested[0].removedAttributes).toEqual(['src']);

    requested[0].deferredDecode?.resolve();
    await Promise.resolve();
  });

  it('does not cancel a completed transfer while its decode remains pending', async () => {
    const { cancelImagePrefetchesExcept, predecodeImage } = await import('./imagePrefetch');

    predecodeImage('/selected.svg');
    requested[0].onload?.();
    cancelImagePrefetchesExcept('/other.svg');

    expect(requested[0].removedAttributes).toEqual([]);

    requested[0].deferredDecode?.resolve();
    await Promise.resolve();
  });

  it('upgrades an earlier fetch to decode before its transfer completes', async () => {
    const { predecodeImage, prefetchImages } = await import('./imagePrefetch');

    prefetchImages(['/selected.svg']);
    predecodeImage('/selected.svg');

    expect(requested).toHaveLength(1);
    expect(requested[0].decodeCalls).toBe(1);
  });

  it('decodes from cache when an earlier fetch already completed', async () => {
    const { predecodeImage, prefetchImages } = await import('./imagePrefetch');

    prefetchImages(['/selected.svg']);
    requested[0].onload?.();
    predecodeImage('/selected.svg');

    expect(requested).toHaveLength(2);
    expect(requested[1].decodeCalls).toBe(1);
  });

  it('retries a decode after the previous attempt rejects', async () => {
    const { predecodeImage } = await import('./imagePrefetch');

    predecodeImage('/selected.svg');
    requested[0].onload?.();
    requested[0].deferredDecode?.reject();
    await new Promise((resolve) => setTimeout(resolve));
    predecodeImage('/selected.svg');

    expect(requested).toHaveLength(2);
    expect(requested[1].decodeCalls).toBe(1);
  });

  it('decodes every responsive selector in a requested set', async () => {
    const { predecodeImages } = await import('./imagePrefetch');

    predecodeImages([
      { src: '/cat.webp', srcset: '/cat-240.webp 240w', sizes: '120px' },
      { src: '/cow.webp', srcset: '/cow-240.webp 240w', sizes: '120px' },
    ]);

    expect(requested).toHaveLength(2);
    expect(requested.map((image) => image.decodeCalls)).toEqual([1, 1]);
  });
});
