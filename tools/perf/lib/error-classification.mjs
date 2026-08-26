// Issue 1296: a catch written to mean "this could not reach an answer" must
// not also swallow "this code is broken" — the launch diagnostic shipped
// throwing a ReferenceError on every invocation and looked exactly like a log
// with no recognisable cause. The rule is distinguishability, not fewer
// catches: most swallows are correct, and this module is how a retry loop or
// benign-default catch lets broken code escape while operational failure stays
// swallowed.
//
// Only ReferenceError is rethrown. TypeError is deliberately NOT: undici
// reports network failure as TypeError('fetch failed'), and a missing
// property on a partially-loaded CDP or probe response is a TypeError too —
// both are exactly the not-ready states a retry loop exists to ride out.
// Rethrowing them would turn transient device states into crashes, which is
// the opposite trade from the one issue 1296 documents.
export function rethrowIfBroken(error) {
  if (error instanceof ReferenceError) throw error;
}
