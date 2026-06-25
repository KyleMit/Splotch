import type { HandleClientError } from '@sveltejs/kit';

// Last-resort logger for uncaught client errors. No third-party telemetry by
// design — the app ships no analytics or tracking (see the About tab), so the
// error only goes to the console; the user-facing fallback is ErrorScreen.
export const handleError: HandleClientError = ({ error, event }) => {
  console.error('[client error]', event?.url?.pathname ?? '', error);
  return { message: 'Something went wrong.' };
};
