// Which of two uploaded reports to keep.
//
// Safari can run two instances of the same navigation, and the second one
// records nothing — a suspended tab's bootstrap answers the same plan and posts
// a near-empty report that would otherwise overwrite the real capture, giving a
// run with frames but almost no pointer events. Keep whichever report saw more
// input rather than whichever arrived last.
//
// An error report always wins: it is the capture telling us why it produced
// nothing, and losing it to a thickness comparison leaves a silent empty run.
const eventCount = (payload) => payload?.report?.events?.length ?? 0;

// The on-disk debug copy of an accepted report. Acceptance is nonce-gated, but
// the filename was label-only, so two runs sharing a label overwrote each
// other's file — the nonce is the run identity and belongs in the name. A
// hand-opened standalone host runs plans that carry no nonce; those keep the
// label-only name because there is no run identity to disambiguate with.
export function reportFileName(plan) {
  return plan?.nonce ? `${plan.label}.${plan.nonce}.json` : `${plan.label}.json`;
}

export function keepIncomingReport(stored, incoming) {
  if (!stored) return true;
  if (incoming?.error) return true;
  if (stored.error) return true;
  return eventCount(incoming) > eventCount(stored);
}

// A report from a run that is no longer the current one. Readiness has always
// been nonce-checked; the report was not, and the report carried no nonce at all
// — so a page left over from an earlier run could upload its frame and event
// tables under the CURRENT plan's label. The artifact then took its brush,
// orientation and observed theme from the page that was ready, and its NUMBERS
// from a different page. That is a plausible wrong number with every provenance
// field agreeing, which is the shape this whole transport exists to prevent.
//
// Checked before thinness: a stale report is refused whatever its size, and
// saying so names the run rather than blaming the event count.
export function reportRejectionReason(stored, incoming, currentNonce) {
  if (currentNonce && incoming?.nonce !== currentNonce) {
    return `a report from ${incoming?.nonce ?? 'an unidentified run'}, not ${currentNonce}`;
  }
  if (keepIncomingReport(stored, incoming)) return null;
  return `a thinner report (${eventCount(incoming)} <= ${eventCount(stored)} events)`;
}
