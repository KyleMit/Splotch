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

// Abort the model call with headroom below the ceiling, so the 502 body is
// serialized and returned before the platform would kill the invocation.
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

// A generation handed to the background worker is collected by polling
// /api/generation-result (ADR-0115), so the client's bound is no longer the
// platform's — it is how long a child should be left waiting before the app
// admits it isn't coming. Sized past the slowest effort tier measured in the
// bake-off, with room for the handoff either side.
export const GENERATION_POLL_TIMEOUT_MS = 240_000;

// How often to look while waiting. Frequent enough that a fast generation still
// feels prompt, spread enough that a two-minute wait is a couple of dozen
// requests rather than a couple of hundred.
export const GENERATION_POLL_INTERVAL_MS = 3_000;

// How long a background generation stays collectible (ADR-0115). It bounds two
// things that must not disagree: how long the job store keeps an outcome, and
// how long a free-generation reservation is held open waiting for that outcome
// to be settled. A lease shorter than this reclaims the slot while the picture
// is still legitimately on its way, and the completion that follows finds no
// reservation and silently books a success as an abandoned failure.
export const GENERATION_JOB_TTL_MS = 20 * 60 * 1000;
