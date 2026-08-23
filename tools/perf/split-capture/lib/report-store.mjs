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

export function keepIncomingReport(stored, incoming) {
  if (!stored) return true;
  if (incoming?.error) return true;
  if (stored.error) return true;
  return eventCount(incoming) > eventCount(stored);
}

export function reportRejectionReason(stored, incoming) {
  if (keepIncomingReport(stored, incoming)) return null;
  return `a thinner report (${eventCount(incoming)} <= ${eventCount(stored)} events)`;
}
