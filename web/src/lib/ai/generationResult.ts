// The one machine-readable fact the poll endpoint carries beyond its status
// (ADR-0115).
//
// Three different things reach the client as a 502 — the job store could not be
// read, the generation itself failed, the bytes went missing — and only one of
// them means "stop waiting". Telling them apart by message text is exactly what
// the repo forbids, and getting it wrong throws away a finished picture that has
// already been paid for.

/** The job could not be read *right now*. Says nothing about the job. */
export const GENERATION_UNAVAILABLE_CODE = 'GENERATION_UNAVAILABLE';

export interface GenerationUnavailable {
  ok: false;
  code: typeof GENERATION_UNAVAILABLE_CODE;
  error: string;
}
