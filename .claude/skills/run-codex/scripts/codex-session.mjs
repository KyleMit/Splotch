import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const SESSION_DIRECTORY = join(homedir(), '.config', 'splotch-run-codex', 'sessions');
// Codex thread ids are UUIDs; refusing anything else keeps a corrupt or hand-edited record from
// reaching the command line as an argument of its own.
const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_OPTIONS = { mode: 0o600 };
const KEY_LENGTH = 32;

// One record per checkout and branch, so consecutive rounds on the same work continue the same
// reviewer while an unrelated branch in another worktree gets its own.
export function sessionKey(repoRoot, branch) {
  return createHash('sha256').update(`${repoRoot}\n${branch}`).digest('hex').slice(0, KEY_LENGTH);
}

export function sessionRecordPath(key, directory = SESSION_DIRECTORY) {
  return join(directory, `${key}.json`);
}

export function parseSessionRecord(raw) {
  const record = JSON.parse(raw);
  if (!THREAD_ID_PATTERN.test(record?.threadId ?? '')) return undefined;
  if (!Number.isInteger(record.rounds) || record.rounds < 1) return undefined;
  return record;
}

export function readSessionRecord(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return parseSessionRecord(raw);
  } catch {
    // An unreadable record is discarded rather than followed: the next round starts fresh instead
    // of resuming whatever a corrupt file happens to name.
    return undefined;
  }
}

export function writeSessionRecord(path, record) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, RECORD_OPTIONS);
}

export function removeSessionRecord(path) {
  rmSync(path, { force: true });
}
