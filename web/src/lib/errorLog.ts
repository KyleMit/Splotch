// Shared vocabulary for the three uncaught-error sinks (hooks.client.ts,
// hooks.server.ts, the root layout's render boundary) so their console prefixes stay in step.
// GENERIC_ERROR_MESSAGE is only consumed by hooks.client.ts/hooks.server.ts — it reaches
// SvelteKit's default fallback error page (no custom error.html here) and, from the server hook,
// the JSON error body of a thrown /api/* +server.ts handler. It never reaches ErrorScreen: the
// render boundary and +error.svelte both render ErrorScreen's own hardcoded copy instead.
export const ERROR_LOG_PREFIX = {
  client: '[client error]',
  server: '[server error]',
  render: '[render error]',
} as const;

export const GENERIC_ERROR_MESSAGE = 'Something went wrong.';
