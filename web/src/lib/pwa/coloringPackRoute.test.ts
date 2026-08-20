import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLORING_PACK_ASSET_URL_PATTERN,
  serveInstalledColoringPackAsset,
} from './coloringPackRoute';

afterEach(() => vi.unstubAllGlobals());

describe('coloring-pack service-worker route', () => {
  it('matches canonical assets without matching responsive assets or the manifest', () => {
    expect(COLORING_PACK_ASSET_URL_PATTERN.test('/coloring/farm/cat-tall.overlay.webp')).toBe(true);
    expect(COLORING_PACK_ASSET_URL_PATTERN.test('/coloring/farm/cat-tall.overlay.svg')).toBe(true);
    expect(
      COLORING_PACK_ASSET_URL_PATTERN.test('/coloring/max-1152px/farm/cat-tall.overlay.webp')
    ).toBe(false);
    expect(COLORING_PACK_ASSET_URL_PATTERN.test('/coloring/manifest-1.4.0.json')).toBe(false);
  });

  it('serves an installed response before consulting the network', async () => {
    const installed = new Response('installed');
    const match = vi.fn(async () => installed);
    const fetchMock = vi.fn();
    vi.stubGlobal('caches', { match });
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request('https://splotch.art/coloring/dinosaur/cover.thumb.webp');

    await expect(serveInstalledColoringPackAsset({ request })).resolves.toBe(installed);
    expect(match).toHaveBeenCalledWith(request, { ignoreSearch: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('remains self-contained when Workbox serializes it', async () => {
    const serialized = Function(
      `return (${serveInstalledColoringPackAsset.toString()})`
    )() as (input: { request: Request }) => Promise<Response>;
    const network = new Response('network');
    vi.stubGlobal('caches', { match: vi.fn(async () => undefined) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => network)
    );

    await expect(
      serialized({ request: new Request('https://splotch.art/coloring/dinosaur/cover.thumb.webp') })
    ).resolves.toBe(network);
  });
});
