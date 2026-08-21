// The resume record for a campaign run: which cells are done, how many attempts a
// cell has spent, and which ones exhausted them.
//
// Pure over rows so the policy is testable without a device. The runner owns the
// file and the child processes; this owns what the rows mean.

export const LEDGER_HEADER = ['timestamp', 'cell', 'status', 'attempt', 'artifact', 'log'];

export const COMPLETE = 'valid-json';
export const ALREADY_VALID = 'already-valid';
export const FAILED = 'missing-or-invalid-json';

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
  return rows.filter((row) => row.cell === cellId && row.status?.startsWith(FAILED)).length;
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
export function nextAction(rows, cellId, { artifactValid, maxAttempts }) {
  if (artifactValid) return { action: 'skip', reason: ALREADY_VALID };
  const spent = attemptsFor(rows, cellId);
  if (spent >= maxAttempts) return { action: 'p1', reason: `${spent} attempts exhausted`, spent };
  return { action: 'run', attempt: spent + 1 };
}

export function summarize(plan, rows, artifactValid) {
  const complete = [];
  const outstanding = [];
  const p1 = [];
  for (const cell of plan) {
    if (artifactValid(cell.artifact)) complete.push(cell.id);
    else if (attemptsFor(rows, cell.id) > 0 && !isComplete(rows, cell.id)) {
      (attemptsFor(rows, cell.id) >= 3 ? p1 : outstanding).push(cell.id);
    } else outstanding.push(cell.id);
  }
  return { total: plan.length, complete, outstanding, p1 };
}
