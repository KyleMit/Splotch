// The prerendered home page, precached under the build-unique URL
// web/src/lib/pwa/appShellRoute.ts builds; the test drift-guards the two.
export const APP_SHELL_PRECACHE_URL_PATTERN = /^\/\?app-shell-build=[^&]+$/;

export function precacheUrlsFromSource(source) {
  return [...source.matchAll(/\{url:("(?:\\.|[^"\\])*"),revision:/g)].map((match) =>
    JSON.parse(match[1])
  );
}
