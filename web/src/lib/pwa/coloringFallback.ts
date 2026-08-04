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

export async function serveResponsiveColoringWithCanonicalFallback({
  request,
  url,
}: ColoringFallbackHandlerOptions): Promise<Response> {
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
  canonicalUrl.pathname = canonicalUrl.pathname.replace(/\/coloring\/max-\d+px\//, '/coloring/');
  const canonicalResponse = await caches.match(canonicalUrl.href, { ignoreSearch: true });
  if (canonicalResponse) return canonicalResponse;
  if (unavailableResponse) return unavailableResponse;
  throw networkError;
}
