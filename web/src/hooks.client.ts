import type { HandleClientError } from '@sveltejs/kit';
import { ERROR_LOG_PREFIX, GENERIC_ERROR_MESSAGE } from '$lib/errorLog';

// Last-resort logger for uncaught client errors. No third-party telemetry by
// design — the app ships no analytics or tracking (see the About tab), so the
// error only goes to the console; the user-facing fallback is ErrorScreen.
export const handleError: HandleClientError = ({ error, event }) => {
  console.error(ERROR_LOG_PREFIX.client, event?.url?.pathname ?? '', error);
  return { message: GENERIC_ERROR_MESSAGE };
};
