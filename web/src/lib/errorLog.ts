// Shared vocabulary for the uncaught-error sinks (hooks.client.ts, hooks.server.ts, the root
// layout's render boundary, and lib/server/http.ts's apiHandler) so their console prefixes stay
// in step. GENERIC_ERROR_MESSAGE reaches SvelteKit's default fallback error page (no custom
// error.html here) via the hooks, and the canonical `{ ok:false, error }` 500 body via
// apiHandler's unexpected-error catch. It never reaches ErrorScreen: the render boundary and
// +error.svelte both render ErrorScreen's own hardcoded copy instead.
export const ERROR_LOG_PREFIX = {
  client: '[client error]',
  server: '[server error]',
  render: '[render error]',
} as const;

export const GENERIC_ERROR_MESSAGE = 'Something went wrong.';
