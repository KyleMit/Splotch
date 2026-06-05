// On the web the API lives at a same-origin relative path. Inside the native
// apps there is no local server, so __NATIVE_API_BASE__ (set at build time in
// vite.config.js) points requests at the hosted endpoint; the server returns
// permissive CORS so the WebView origin can reach it.
export function apiUrl(path: string): string {
  const base = typeof __NATIVE_API_BASE__ !== 'undefined' ? __NATIVE_API_BASE__ : '';
  return `${base}${path}`;
}
