// Shared plumbing for the audit-burndown scripts (the burn-down-audits skill).
// Unlike scripts/lib/utils.mjs's run()/capture(), the runners here return
// status instead of exiting — the driver loop handles every failure itself
// (a failed step costs one iteration, not the run; see ADR-0017's caveat).

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/utils.mjs';

export { ROOT };
export const WORK = '.audit-work';
export const LOGS = join(WORK, 'logs');
export const PROMPTS = 'scripts/audit-burndown/prompts';

export const auditFile = () => process.env.AUDIT_FILE || 'docs/AUDIT.md';

// Every entry script chdirs to the repo root so relative paths (docs/AUDIT.md,
// .audit-work/) behave the same no matter where it was invoked from.
export function chdirRoot() {
  process.chdir(ROOT);
}

export function ensureWorkDirs() {
  mkdirSync(LOGS, { recursive: true });
}

export function logLine(message) {
  const time = new Date().toTimeString().slice(0, 8);
  const line = `[${time}] ${message}`;
  console.error(line);
  ensureWorkDirs();
  appendFileSync(join(LOGS, 'run.log'), `${line}\n`);
}

const MAX_BUFFER = 64 * 1024 * 1024;

// Direct spawn (no shell): claude prompts and review feedback contain quotes,
// backticks, and newlines that no quoting helper should ever have to survive.
export function runCmd(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: MAX_BUFFER, ...options });
}

export const git = (...args) => runCmd('git', args);
export const gitOk = (...args) => git(...args).status === 0;
export const gitOut = (...args) => (git(...args).stdout ?? '').trim();

// CHECK_CMD is a user-supplied command line ('npm run check'), so it goes
// through the shell.
export function shellOk(command) {
  return spawnSync(command, { shell: true, stdio: 'ignore', maxBuffer: MAX_BUFFER }).status === 0;
}

// ---- docs/AUDIT.md parsing --------------------------------------------------
// Findings are level-3 headings of the form `### [Category] Title` under
// `## Source: <audit>` sections (.claude/audit-conventions.md). An entry runs
// until the next entry heading or the next `## ` section heading. No agent
// should ever read or edit AUDIT.md directly — at ~19k lines it blows out a
// context window, and hundreds of sequential Edit calls against one file is a
// corruption risk. These helpers (via pop.mjs) are the only thing touching it.

const isEntryStart = (line) => /^### \[/.test(line);
const isBoundary = (line) => isEntryStart(line) || /^## /.test(line);

function readLines(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').split('\n');
}

function entryStarts(lines) {
  return lines.flatMap((line, i) => (isEntryStart(line) ? [i] : []));
}

// Both bounds inclusive, 0-based.
function entryRange(lines, start) {
  let end = lines.length - 1;
  for (let i = start + 1; i < lines.length; i++) {
    if (isBoundary(lines[i])) {
      end = i - 1;
      break;
    }
  }
  return { start, end };
}

export function countEntries(file = auditFile()) {
  const lines = readLines(file);
  if (!lines) return null;
  return entryStarts(lines).length;
}

// The Nth entry (1-based) as text, or null when there is no such entry.
export function getEntry(index = 1, file = auditFile()) {
  const lines = readLines(file);
  if (!lines) return null;
  const start = entryStarts(lines)[index - 1];
  if (start === undefined) return null;
  const { end } = entryRange(lines, start);
  return lines.slice(start, end + 1).join('\n');
}

// Remove the first entry in place. Collapses the blank-line seam the excision
// leaves so the file stays dprint-clean, and trims trailing blank lines.
export function deleteFirstEntry(file = auditFile()) {
  const lines = readLines(file);
  if (!lines) return false;
  const start = entryStarts(lines)[0];
  if (start === undefined) return false;
  const { end } = entryRange(lines, start);
  lines.splice(start, end - start + 1);
  while (start > 0 && lines[start - 1]?.trim() === '' && lines[start]?.trim() === '') {
    lines.splice(start, 1);
  }
  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
    lines.pop();
  }
  writeFileSync(file, lines.join('\n'));
  return true;
}
