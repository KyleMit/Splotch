import { inspect } from 'node:util';

// Alias-free on purpose: the background worker under netlify/ logs through this
// and is built without SvelteKit's `$lib` alias.
//
// The server holds two capabilities shaped as 64 lowercase hex characters: a
// generation job id (`JOB_ID_BYTES` in generationJobs.ts), which collects a
// picture, and an installation id (`$lib/installationId`), which spends that
// installation's free grant and binds its report tokens. Both are blob keys, and
// a store error can quote the key it failed on — the Netlify Blobs SDK appends
// the response body to its message. So a log line masks anything shaped like
// either rather than trust a message not to carry one. logRedaction.test.ts
// mints both kinds to keep this shape in step with theirs.
const CAPABILITY_ID_IN_TEXT = /[a-f0-9]{64}/g;
const REDACTED_ID = '<redacted id>';

/** `text` with every run shaped like a job id or an installation id masked. */
function redactCapabilityIds(text: string): string {
  return text.replace(CAPABILITY_ID_IN_TEXT, REDACTED_ID);
}

/** An expected failure as a warning may carry it: the message alone, ids masked. */
export function loggableError(cause: unknown): string {
  return redactCapabilityIds(cause instanceof Error ? cause.message : String(cause));
}

/**
 * An unexpected failure as the `[server error]` sinks log it: what `console.error`
 * would print for the raw value — stack and `cause` chain included — ids masked.
 */
export function loggableFailure(cause: unknown): string {
  return redactCapabilityIds(inspect(cause));
}
