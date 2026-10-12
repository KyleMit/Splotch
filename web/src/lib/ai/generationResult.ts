// The wire vocabulary the generation endpoints answer in and the client reads
// (ADR-0115). Declared once, here, so the routes and the client parser cannot
// drift apart: a field or status only one side learns about fails quietly — the
// client stops waiting for a picture the server has already paid for.
//
// The client imports this, so it stays dependency-free.

/** Accepted: a start's job ticket, or a poll's "not finished yet". */
export const GENERATION_ACCEPTED_STATUS = 202;

// A safety refusal tells the child to try a different drawing, unlike a retryable upstream failure.
// The distinct status is part of the red-team safety contract in ADR-0023.
export const SAFETY_REFUSAL_STATUS = 422;

export const THROTTLED_STATUS = 429;

/** What a start hands back when the background worker took the job. */
export interface StartedGeneration {
  jobId: string;
  pollAfterMs: number;
}

export type GenerationStartedBody = { ok: true } & StartedGeneration;

// Three different things reach the client as a 502 — the job store could not be
// read, the generation itself failed, the bytes went missing — and only one of
// them means "stop waiting". Telling them apart by message text is exactly what
// the repo forbids, and getting it wrong throws away a finished picture that has
// already been paid for.

/** The job could not be read *right now*. Says nothing about the job. */
export const GENERATION_UNAVAILABLE_CODE = 'GENERATION_UNAVAILABLE';

export const FREE_GRANT_EXHAUSTED_CODE = 'FREE_GRANT_EXHAUSTED';
export const FREE_DAILY_LIMIT_EXHAUSTED_CODE = 'FREE_DAILY_LIMIT_EXHAUSTED';

export interface GenerationUnavailable {
  ok: false;
  code: typeof GENERATION_UNAVAILABLE_CODE;
  error: string;
}
