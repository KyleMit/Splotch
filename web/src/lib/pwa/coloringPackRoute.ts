export const COLORING_PACK_ASSET_URL_PATTERN =
  /\/coloring\/(?!max-\d+px\/)[^/]+\/.+\.(?:webp|svg)$/;

export async function serveInstalledColoringPackAsset({
  request,
}: {
  request: Request;
}): Promise<Response> {
  const installed = await caches.match(request, { ignoreSearch: true });
  return installed ?? fetch(request);
}
