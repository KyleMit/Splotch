import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESPONSIVE_COLORING_TIER_DIRECTORIES } from '../state/books';
import {
  RESPONSIVE_COLORING_URL_PATTERN,
  serveResponsiveColoringWithCanonicalFallback,
} from './coloringFallback';

const origin = 'https://splotch.art';

function requestFor(path: string) {
  const url = new URL(path, origin);
  return { request: new Request(url), url };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('responsive coloring service-worker route', () => {
  it('matches every declared tier and no canonical or unknown tier', () => {
    for (const directory of RESPONSIVE_COLORING_TIER_DIRECTORIES) {
      expect(RESPONSIVE_COLORING_URL_PATTERN.test(`${directory}/farm/cat.webp`)).toBe(true);
    }
    expect(RESPONSIVE_COLORING_URL_PATTERN.test('/coloring/farm/cat.webp')).toBe(false);
    expect(RESPONSIVE_COLORING_URL_PATTERN.test('/coloring/max-999px/farm/cat.webp')).toBe(false);
  });

  it('serves an installed pack tier from the cache before the network', async () => {
    const installed = new Response('installed');
    const fetchMock = vi.fn();
    const match = vi.fn(async () => installed);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', { match });
    const input = requestFor('/coloring/max-2304px/farm/cat-wide.presentation.webp?version=one');

    await expect(serveResponsiveColoringWithCanonicalFallback(input)).resolves.toBe(installed);
    expect(match).toHaveBeenCalledWith(input.request, { ignoreSearch: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a successful responsive response without a canonical lookup', async () => {
    const response = new Response('responsive');
    const fetchMock = vi.fn(async () => response);
    const match = vi.fn(async () => undefined);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', { match });
    const input = requestFor('/coloring/max-1152px/farm/cat.overlay.webp');

    await expect(serveResponsiveColoringWithCanonicalFallback(input)).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(input.request);
    expect(match).toHaveBeenCalledTimes(1);
    expect(match).toHaveBeenCalledWith(input.request, { ignoreSearch: true });
  });

  it('falls back from a presentation raster to the canonical SVG it was rendered from', async () => {
    const canonical = new Response('canonical');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline')))
    );
    const match = vi.fn(async (key: unknown) => (typeof key === 'string' ? canonical : undefined));
    vi.stubGlobal('caches', { match });

    await expect(
      serveResponsiveColoringWithCanonicalFallback(
        requestFor('/coloring/max-3072px/farm/cat-tall.dark.presentation.webp')
      )
    ).resolves.toBe(canonical);
    expect(match).toHaveBeenLastCalledWith(`${origin}/coloring/farm/cat-tall.dark.overlay.svg`, {
      ignoreSearch: true,
    });
  });

  it.each(RESPONSIVE_COLORING_TIER_DIRECTORIES)(
    'falls back from %s to the matching precached canonical asset',
    async (directory) => {
      const canonical = new Response('canonical');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject(new TypeError('offline')))
      );
      const match = vi.fn(async (key: unknown) =>
        typeof key === 'string' ? canonical : undefined
      );
      vi.stubGlobal('caches', { match });
      const input = requestFor(`${directory}/farm/cat.overlay.webp?version=one`);

      await expect(serveResponsiveColoringWithCanonicalFallback(input)).resolves.toBe(canonical);
      expect(match).toHaveBeenLastCalledWith(
        `${origin}/coloring/farm/cat.overlay.webp?version=one`,
        { ignoreSearch: true }
      );
    }
  );

  it('uses the canonical fallback for an unsuccessful network response', async () => {
    const canonical = new Response('canonical');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 }))
    );
    vi.stubGlobal('caches', {
      match: vi.fn(async (key: unknown) => (typeof key === 'string' ? canonical : undefined)),
    });

    await expect(
      serveResponsiveColoringWithCanonicalFallback(
        requestFor('/coloring/max-240px/farm/cover.thumb.webp')
      )
    ).resolves.toBe(canonical);
  });

  it('preserves the network failure when the canonical asset is unavailable', async () => {
    const unavailable = new Response('missing', { status: 404 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => unavailable)
    );
    vi.stubGlobal('caches', { match: vi.fn(async () => undefined) });

    await expect(
      serveResponsiveColoringWithCanonicalFallback(
        requestFor('/coloring/max-240px/farm/cover.thumb.webp')
      )
    ).resolves.toBe(unavailable);

    const offline = new TypeError('offline');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(offline))
    );
    await expect(
      serveResponsiveColoringWithCanonicalFallback(
        requestFor('/coloring/max-240px/farm/cover.thumb.webp')
      )
    ).rejects.toBe(offline);
  });

  it('remains self-contained when Workbox serializes the handler', async () => {
    const serializedHandler = Function(
      `return (${serveResponsiveColoringWithCanonicalFallback.toString()})`
    )() as typeof serveResponsiveColoringWithCanonicalFallback;
    const canonical = new Response('canonical');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline')))
    );
    vi.stubGlobal('caches', {
      match: vi.fn(async (key: unknown) => (typeof key === 'string' ? canonical : undefined)),
    });

    await expect(
      serializedHandler(requestFor('/coloring/max-1152px/farm/cat.overlay.webp'))
    ).resolves.toBe(canonical);
  });
});
