// Shared vocabulary for the three uncaught-error sinks (hooks.client.ts,
// hooks.server.ts, the root layout's render boundary) so their console prefixes
// and user-facing fallback stay in step.
export const ERROR_LOG_PREFIX = {
  client: '[client error]',
  server: '[server error]',
  render: '[render error]',
} as const;

export const GENERIC_ERROR_MESSAGE = 'Something went wrong.';
