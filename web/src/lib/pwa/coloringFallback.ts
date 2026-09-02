import { RESPONSIVE_COLORING_TIER_DIRECTORIES } from '../state/books';

const escapedTierDirectories = RESPONSIVE_COLORING_TIER_DIRECTORIES.map((directory) =>
  directory.replaceAll('/', '\\/')
);

export const RESPONSIVE_COLORING_URL_PATTERN = new RegExp(
  `(?:${escapedTierDirectories.join('|')})\\/.+\\.webp$`
);

interface ColoringFallbackHandlerOptions {
  request: Request;
  url: URL;
}

// Workbox serializes this handler into the service worker, so it stays
// self-contained: an installed web pack stores the paper's presentation tiers
// under their own tier URLs, which is why the cache is consulted before the
// network; a tier nobody installed falls back to the precached canonical file —
// for a presentation raster, the canonical SVG it was rendered from.
export async function serveResponsiveColoringWithCanonicalFallback({
  request,
  url,
}: ColoringFallbackHandlerOptions): Promise<Response> {
  const installed = await caches.match(request, { ignoreSearch: true });
  if (installed) return installed;

  let unavailableResponse: Response | null = null;
  let networkError: unknown;
  try {
    const response = await fetch(request);
    if (response.ok) return response;
    unavailableResponse = response;
  } catch (error) {
    networkError = error;
  }

  const canonicalUrl = new URL(url.href);
  canonicalUrl.pathname = canonicalUrl.pathname
    .replace(/\/coloring\/max-\d+px\//, '/coloring/')
    .replace(/\.presentation\.webp$/, '.overlay.svg');
  const canonicalResponse = await caches.match(canonicalUrl.href, { ignoreSearch: true });
  if (canonicalResponse) return canonicalResponse;
  if (unavailableResponse) return unavailableResponse;
  throw networkError;
}
