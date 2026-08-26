// Issue 1296: a catch written to mean "this could not reach an answer" must
// not also swallow "this code is broken" — the launch diagnostic shipped
// throwing a ReferenceError on every invocation and looked exactly like a log
// with no recognisable cause. The rule is distinguishability, not fewer
// catches: most swallows are correct, and this module is how a retry loop or
// benign-default catch lets broken code escape while operational failure stays
// swallowed.
//
// ReferenceError is always programmer error. TypeError is programmer error —
// a null/undefined property dereference in a predicate reads as an honest
// negative without this (the PR 1376 review reproduced exactly that through
// pollFor) — EXCEPT for the network failures the fetch stack spells as
// TypeError: undici reports connection failure as TypeError('fetch failed'),
// WebKit as 'Load failed', Chromium as 'Failed to fetch', and undici's
// mid-body abort as 'terminated'. Those are the not-ready states a retry loop
// exists to ride out, recognized by their fixed messages rather than by
// classifying the whole type either way.
const NETWORK_TYPEERROR_MESSAGES = ['fetch failed', 'Failed to fetch', 'Load failed', 'terminated'];

function isNetworkTypeError(error) {
  const message = String(error?.message ?? '');
  return NETWORK_TYPEERROR_MESSAGES.some((marker) => message.includes(marker));
}

export function rethrowIfBroken(error) {
  if (error instanceof ReferenceError) throw error;
  if (error instanceof TypeError && !isNetworkTypeError(error)) throw error;
}
