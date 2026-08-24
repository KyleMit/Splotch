// The resume record for a campaign run: which cells are done, how many attempts a
// cell has spent, and which ones exhausted them.
//
// Pure over rows so the policy is testable without a device. The runner owns the
// file and the child processes; this owns what the rows mean.

export const LEDGER_HEADER = ['timestamp', 'cell', 'status', 'attempt', 'artifact', 'log'];

export const COMPLETE = 'valid-json';
export const ALREADY_VALID = 'already-valid';
export const FAILED = 'missing-or-invalid-json';
// Distinct from FAILED so a resumed run recording an exhausted cell does not itself
// count as another failed attempt the next time the ledger is read.
export const EXHAUSTED = 'attempts-exhausted';
// A capture that parsed and cannot be scored is not a missing artifact, and saying
// so matters when the ledger is read later: a run of FAILED rows means the attempts
// recorded nothing and the ledger is safe to clear, which is the opposite of true
// here. It still spends an attempt.
export const UNSCOREABLE = 'failed-input-fidelity';
// A capture measured at a refresh rate the target is not scored against. Like
// UNSCOREABLE it parsed and cannot be compared, and unlike it the capture itself is
// fine — a ProMotion panel simply presented at the other rate that run, so a retry
// has a real chance of landing in the expected regime. It spends an attempt for the
// same reason: a run of these is not an empty ledger.
export const OFF_REFRESH_REGIME = 'off-refresh-regime';
// A capture whose only obstacle is a check the instrument has no expectation for.
// It parsed, it may have been driven perfectly, and it can never pass as things
// stand — so unlike every other non-complete status it is NOT retried. The cost
// of treating it as an ordinary failure is measured in device hours: a 20-cell
// physical target spends 60 attempts to reach the same structural answer, on
// hardware only one session can hold at a time. Closing it means measuring the
// runtime, not recapturing the cell.
export const UNCALIBRATED_RUNTIME = 'uncalibrated-runtime';

export function formatLedgerRow({ timestamp, cell, status, attempt, artifact, log }) {
  return [timestamp, cell, status, String(attempt), artifact, log ?? '-'].join('\t');
}

export function parseLedger(text) {
  if (!text?.trim()) return [];
  const [header, ...lines] = text.trimEnd().split('\n');
  const start = header.startsWith(LEDGER_HEADER[0]) ? 0 : -1;
  const rows = start === 0 ? lines : [header, ...lines];
  return rows
    .filter((line) => line.trim())
    .map((line) => {
      const [timestamp, cell, status, attempt, artifact, log] = line.split('\t');
      return { timestamp, cell, status, attempt: Number(attempt), artifact, log };
    });
}

export function attemptsFor(rows, cellId) {
  return rows.filter(
    (row) =>
      row.cell === cellId &&
      (row.status?.startsWith(FAILED) ||
        row.status?.startsWith(UNSCOREABLE) ||
        row.status?.startsWith(UNCALIBRATED_RUNTIME) ||
        row.status?.startsWith(OFF_REFRESH_REGIME))
  ).length;
}

// The ledger is an append-only log with skip and retry rows, so its LINE COUNT is
// not its cell count and neither is a grep for one status. A resumed run records
// `already-valid` rather than `valid-json` for work it skipped, so counting only
// the latter undercounts too.
//
// Both mistakes were made while monitoring an unattended run on 2026-08-23: a
// row-count watcher stopped a 20-cell target five cells early and nobody noticed
// until the fold-in refused the mode, and a `valid-json` filter then reported a
// finished target as a third done. This is the one place that answer lives.
export function completedCells(rows) {
  const done = new Set();
  for (const row of rows) {
    if (row.status?.startsWith(COMPLETE) || row.status === ALREADY_VALID) done.add(row.cell);
  }
  return done;
}

export function isComplete(rows, cellId) {
  return rows.some(
    (row) =>
      row.cell === cellId && (row.status?.startsWith(COMPLETE) || row.status === ALREADY_VALID)
  );
}

// A cell that already produced a parseable artifact is never re-run: recapturing a
// first valid result — a red gate included — would replace it with a different
// number, which is the one thing a snapshot campaign must not do.
// `runtimeStillUncalibrated` re-asks the question the ledger row answered when it
// was written. Without it the row is terminal forever: seed one, calibrate the
// runtime, and a resumed campaign still refuses to capture the cell under the new
// instrument. That is not hypothetical — this campaign calibrated Android Chrome
// one PR after introducing the status, which would have stranded every cell an
// earlier run had already given up on.
//
// It defaults to true so a caller that does not ask keeps the conservative
// behaviour, rather than silently reviving conclusions it cannot evaluate.
export function nextAction(
  rows,
  cellId,
  { artifactValid, maxAttempts, runtimeStillUncalibrated = true }
) {
  if (artifactValid) return { action: 'skip', reason: ALREADY_VALID };
  const spent = attemptsFor(rows, cellId);
  if (runtimeStillUncalibrated && hasUncalibratedRuntime(rows, cellId)) {
    return { action: 'p1', reason: 'the runtime has no measured expectation', spent };
  }
  if (spent >= maxAttempts) return { action: 'p1', reason: `${spent} attempts exhausted`, spent };
  return { action: 'run', attempt: spent + 1 };
}

// Read from any row for the cell rather than only the newest: the answer is a
// property of the instrument and the runtime, so an earlier attempt establishing
// it is as good as the last one, and a resumed run must not re-spend attempts an
// earlier run already proved were futile.
// `startsWith`, because the runner suffixes every attempt row with the child's
// exit code. An equality check here reads as correct and matches nothing.
export function hasUncalibratedRuntime(rows, cellId) {
  return rows.some((row) => row.cell === cellId && row.status?.startsWith(UNCALIBRATED_RUNTIME));
}

export function summarize(plan, rows, artifactValid) {
  const complete = [];
  const outstanding = [];
  const p1 = [];
  for (const cell of plan) {
    if (artifactValid(cell.artifact)) complete.push(cell.id);
    // A cell held by an uncalibrated runtime is finished, not waiting: no further
    // attempt can change it, so reporting it as outstanding would describe work
    // that will never happen as work still to do.
    else if (hasUncalibratedRuntime(rows, cell.id)) p1.push(cell.id);
    else if (attemptsFor(rows, cell.id) > 0 && !isComplete(rows, cell.id)) {
      (attemptsFor(rows, cell.id) >= 3 ? p1 : outstanding).push(cell.id);
    } else outstanding.push(cell.id);
  }
  return { total: plan.length, complete, outstanding, p1 };
}
