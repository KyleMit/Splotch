export const ACCESS_TOKEN_HEADER = 'X-Access-Token';
export const API_KEY_HEADER = 'X-Api-Key';
export const INSTALLATION_ID_HEADER = 'X-Installation-Id';
export const FREE_GENERATIONS_REMAINING_HEADER = 'X-Free-Generations-Remaining';
// Minted for every safety refusal, and for successful free runs, then spent by
// report-image. It travels in both directions and belongs in the CORS allow and
// expose lists.
export const REPORT_TOKEN_HEADER = 'X-Report-Token';

// Sent by a client that can handle a generation finishing in a later request
// (ADR-0115). It is a capability the caller declares, not a mode it demands:
// the server still answers synchronously when it has no background worker to
// hand the job to, and a client that never sends it always gets the old shape.
export const ASYNC_GENERATION_HEADER = 'X-Async-Generation';
