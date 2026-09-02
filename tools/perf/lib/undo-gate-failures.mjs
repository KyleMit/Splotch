// What the post-merge WebKit gate's fresh-runner retry compares.
//
// The retry job exists to ask one question: did the FIRST runner's failure happen
// again on a second one? Comparing job outcomes cannot answer it. On 2026-09-02
// the first runner skipped `crayon-scribbles` on a settle timeout while measuring
// `multi-finger` at a clean 7 ms p95; the retry runner completed `crayon-scribbles`
// and breached on `multi-finger`. Two failures with nothing in common, and the
// pipeline read "failed, failed" as a reproduced breach and filed against main.
//
// So a run's failure is fingerprinted by WHAT failed, not by whether something did,
// and a breach reproduces only when the same scenario failed the same way twice.

const GATE_FAILURE_CAUSES = Object.freeze({
  // The scenario's commit p95 was measured and exceeded the budget.
  breach: 'breach',
  // The scenario never produced a measurement — a settle timeout, a navigation
  // failure, anything that leaves the gate without coverage of it.
  incomplete: 'incomplete',
});

// Failures that belong to the run rather than to one scenario.
const GATE_RUN_SCOPE = 'run';
const GATE_RUN_FAILURES = Object.freeze({
  // The served bundle carried no engine.* marks, so every duration read 0 ms.
  noCommitSamples: 'no-commit-samples',
});

const entry = (scope, cause) => `${scope}:${cause}`;

// Derived from the artifact rather than from the process's exit code, because the
// exit code is the one thing both runners always agree on.
export function gateFailureFingerprint(summary) {
  const gate = summary?.gate;
  if (!gate) return [];
  const failures = new Set();
  for (const scenario of summary.scenarios ?? []) {
    if (scenario?.skipped) failures.add(entry(scenario.key, GATE_FAILURE_CAUSES.incomplete));
  }
  for (const key of gate.breaches ?? []) failures.add(entry(key, GATE_FAILURE_CAUSES.breach));
  // A gate that reported itself unevaluated with no scenario to blame failed as a
  // whole — the marks-less bundle. Recorded so the retry can reproduce that too,
  // rather than reading it as an empty fingerprint and falling back.
  if (gate.evaluated === false && failures.size === 0) {
    failures.add(entry(GATE_RUN_SCOPE, GATE_RUN_FAILURES.noCommitSamples));
  }
  return [...failures].sort();
}

export const formatGateFailures = (failures) => failures.join(',');

export const parseGateFailures = (text) =>
  (text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort();

// The reproduced subset — what BOTH runners saw. Empty means the second runner
// failed for reasons the first one did not, which is not a reproduction.
export function reproducedGateFailures(first, second) {
  const seen = new Set(first);
  return [...new Set(second)].filter((failure) => seen.has(failure)).sort();
}

// Fail closed. A retry that cannot read either fingerprint has not established
// that the failure did NOT reproduce, and this pipeline's job is to file when main
// might be broken — so an unreadable comparison keeps the old outcome-only
// behaviour rather than quietly acquitting. Its caller must be able to tell that
// case from "compared, and nothing reproduced", which is why it reports a sentinel
// instead of the empty list the two would otherwise share.
export const GATE_COMPARISON_UNKNOWN = 'unknown:not-comparable';

export function comparableFingerprints(first, second) {
  return first.length > 0 && second.length > 0;
}
