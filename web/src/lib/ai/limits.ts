// Deadlines for the AI image path, all derived from one measured fact: the
// deployed /api/generate-image runs as a single synchronous, buffered Netlify
// Node function whose hard execution ceiling is 26 s (a 26 s call returns
// cleanly; 30 s is killed with a bare 502). Sizing every deadline off that
// ceiling makes a slow model call fail as Splotch's own controlled response
// rather than Netlify's generic error. Measurement, sweep, and the deadline
// ladder are recorded in ADR-0063.
//
// Invariant: GENERATE_DEADLINE_MS < NETLIFY_SYNC_TIMEOUT_MS < CLIENT_REQUEST_TIMEOUT_MS
// — the server aborts before the platform would, and the client waits just past
// the platform so the server's error always wins. Guarded by limits.test.ts.

// The measured platform ceiling itself — not a knob we control, but named so
// the ladder's invariant is machine-checked against it rather than prose.
export const NETLIFY_SYNC_TIMEOUT_MS = 26_000;

// Abort the Gemini image call with headroom below the ceiling, so the 502 body
// is serialized and returned before the platform would kill the invocation.
export const GENERATE_DEADLINE_MS = 24_000;

// A key check is a one-token model ping; it should never hold an invocation for
// long. Before this bound a hung probe occupied one until the platform killed it.
export const VERIFY_KEY_DEADLINE_MS = 10_000;

// The client aborts just past the platform ceiling: long enough that the
// server's controlled error always arrives first, short enough that a truly
// wedged request doesn't spin far past when the platform has already given up.
// Every synchronous /api POST the client waits on takes this bound, not just
// generate-image — report-image runs as the same kind of buffered function
// under the same ceiling, and an unbounded wait there strands the parent under
// a modal with no way out.
export const CLIENT_REQUEST_TIMEOUT_MS = 27_000;
