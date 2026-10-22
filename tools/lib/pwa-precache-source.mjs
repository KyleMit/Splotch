// The prerendered home page, precached under the build-unique URL
// src/lib/pwa/appShellRoute.ts builds; the test drift-guards the two.
export const APP_SHELL_PRECACHE_URL_PATTERN = /^\/\?app-shell-build=[^&]+$/;

// The navigation route's fallback plugin compiles the shell URL into its callbacks
// as a string literal. The timeout callback answers a stalled launch and the error
// callback an offline one, so each must look up the shell on its own.
export const APP_SHELL_FALLBACK_CALLBACKS = ['cachedResponseWillBeUsed', 'handlerDidError'];

// Each callback name, then its own body up to the next function-valued property in
// any form, then the lookup. A nested function property inside a callback body ends
// the scan early, so the check then reports the lookup missing rather than passing.
const FUNCTION_PROPERTY_START = String.raw`[\w$]+:(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)`;
const APP_SHELL_FALLBACK_LOOKUP_PATTERN = new RegExp(
  String.raw`(${APP_SHELL_FALLBACK_CALLBACKS.join('|')}):async function\b` +
    String.raw`(?:(?!${FUNCTION_PROPERTY_START})[^])*?` +
    String.raw`caches\.match\(("\/\?app-shell-build=(?:\\.|[^"\\])*")\)`,
  'g'
);

export function appShellFallbackLookupsFromSource(source) {
  return [...source.matchAll(APP_SHELL_FALLBACK_LOOKUP_PATTERN)].map((match) => ({
    callback: match[1],
    url: JSON.parse(match[2]),
  }));
}
