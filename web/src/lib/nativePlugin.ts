/**
 * Lazily `import()` a Capacitor plugin's module once and cache it, so repeat
 * callers share a single dynamic import. Pass a thunk that does the *literal*
 * import (keeping the specifier static so Vite can still code-split it):
 *
 *   const getPrefs = lazyPluginModule(() => import('@capacitor/preferences'));
 *   const { Preferences } = await getPrefs();
 *
 * Returns the **module namespace**, and callers must destructure the plugin out
 * of it *after* awaiting — never let a Promise resolve to the plugin itself.
 *
 * Why this matters (a sharp Capacitor footgun): a registered plugin is a Proxy
 * whose every property access — `then` included — resolves to a native-method
 * call. That makes the plugin "thenable", so the moment a Promise resolves to
 * it, JS's promise-assimilation calls `plugin.then(resolve, reject)`. Capacitor
 * dispatches that as a native method literally named `then`, which is "not
 * implemented" and so **never calls resolve/reject** — the promise hangs
 * forever and every awaiter stalls. (This is what blanked the /admin/native
 * page, whose render gated on `await loadAdminSession()`.) The module namespace
 * has no `then` export, so resolving to it is safe; the plugin proxy is only
 * ever touched synchronously, after the await.
 */
export function lazyPluginModule<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => (cached ??= load());
}
