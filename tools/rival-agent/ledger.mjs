import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const LEDGER_DIRECTORY = join(homedir(), '.config', 'splotch-rival-agent', 'ledger');
// The third round on one PR was where the Codex-side publisher's budget stopped: a reviewer asked a
// fourth time to find defects finds something whether or not anything is there.
export const MAX_ROUNDS = 3;
const KEY_LENGTH = 32;
// Codex threads and Claude sessions are both UUIDs; anything else in a record cannot become a
// command-line argument.
const RIVAL_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_OPTIONS = { mode: 0o600 };

// One reviewer conversation per unit of work: a PR keeps one across heads, a branch keeps one
// across pushes, and a single commit or a question is its own unit.
export function ledgerKey({ repoRoot, kind, ref }) {
  return createHash('sha256')
    .update(`${repoRoot}\n${kind}\n${ref}`)
    .digest('hex')
    .slice(0, KEY_LENGTH);
}

export function ledgerPath(key, directory = LEDGER_DIRECTORY) {
  return join(directory, `${key}.json`);
}

export function parseLedgerRecord(raw) {
  const record = JSON.parse(raw);
  if (!RIVAL_SESSION_ID_PATTERN.test(record?.rivalSessionId ?? '')) return undefined;
  if (!Number.isInteger(record.rounds) || record.rounds < 1) return undefined;
  return record;
}

// A record that cannot be trusted is discarded rather than followed: the next round starts fresh
// instead of resuming whatever a corrupt file names.
export function readLedgerRecord(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return parseLedgerRecord(raw);
  } catch {
    return undefined;
  }
}

export function writeLedgerRecord(path, record) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, RECORD_OPTIONS);
}

export function removeLedgerRecord(path) {
  rmSync(path, { force: true });
}

// A record written by the other vendor's launcher holds a session id its CLI cannot resume; the
// key already separates them, and this refuses to follow one that reached the wrong side anyway.
export function planRound(record, { fresh = false, rival } = {}) {
  if (fresh || !record || (rival && record.rival !== rival)) {
    return { round: 1, resume: undefined, previous: undefined };
  }
  if (record.rounds >= MAX_ROUNDS) {
    throw new Error(
      `review round budget of ${MAX_ROUNDS} exhausted; pass --fresh to start a new reviewer or --end-session to close this one`
    );
  }
  return { round: record.rounds + 1, resume: record.rivalSessionId, previous: record };
}

export function recordRound(path, { record, rivalSessionId, base, head, rival }) {
  writeLedgerRecord(path, {
    rival,
    rivalSessionId: record?.rivalSessionId ?? rivalSessionId,
    rounds: (record?.rounds ?? 0) + 1,
    lastBase: base,
    lastHead: head,
    updatedAt: new Date().toISOString(),
  });
}
