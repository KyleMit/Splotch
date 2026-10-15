// A failed run's words for the problem report's diagnostics, read by a grown-up rather than the
// child, who sees the same retry card for each. Dependency-free: the native app's generation owner
// reports the same failures in the same words.
export const AI_TIMEOUT_MESSAGE = "That's taking too long — please try again.";
export const AI_REQUEST_FAILED_MESSAGE = 'The picture request could not complete.';
export const AI_UNFINISHED_MESSAGE = 'The server did not finish the picture.';

// A wait past the poll deadline reads as a gateway timeout, which every client routes to its
// kid-friendly "let's try again".
export const AI_POLL_TIMEOUT_STATUS = 504;
export const AI_POLL_TIMEOUT_MESSAGE = 'The creation did not arrive in time';
