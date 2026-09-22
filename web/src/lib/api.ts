import { CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER } from '$lib/apiHeaders';
import { APP_VERSION } from '$lib/appVersion';
import { getPlatform } from '$lib/platform';

// On the web the API lives at a same-origin relative path. Inside the native
// apps there is no local server, so __NATIVE_API_BASE__ (set at build time in
// vite.config.js) points requests at the hosted endpoint; the server returns
// permissive CORS so the WebView origin can reach it.
export function apiUrl(path: string): string {
  const base = typeof __NATIVE_API_BASE__ !== 'undefined' ? __NATIVE_API_BASE__ : '';
  return `${base}${path}`;
}

// The identifying headers every /api/* request carries (CLIENT_*_HEADER in
// apiHeaders.ts). On the web the version is the per-commit build (ADR-0030);
// in a native app it is the store release. Both come from __APP_VERSION__.
export function apiClientHeaders(): Record<string, string> {
  return {
    [CLIENT_VERSION_HEADER]: APP_VERSION,
    [CLIENT_PLATFORM_HEADER]: __IS_CAPACITOR__ ? getPlatform() : 'web',
  };
}

// fetch() against an /api/* path with the client headers attached. Call-site
// headers win on a name collision, so an endpoint-specific header (a credential,
// the installation id) is never overwritten by the identifying pair.
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    headers: { ...apiClientHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
}
