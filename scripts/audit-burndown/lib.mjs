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

// Findings are titled `[P3][consistency] …`. The priority drives impl-model
// tiering: P4/P5 are the mechanical tail (dead code, renames, dedup) that a
// cheaper model implements fine under the same adversarial review. Returns null
// for a title with no [P<n>] tag so the caller falls back to the safe model
// rather than guessing a priority the finding never claimed.
export function findingPriority(title) {
  const match = /^\[P(\d)\]/.exec(title ?? '');
  return match ? Number(match[1]) : null;
}

// The implementer reports the sha of the commit it made, but that field is
// optional in its schema — a success=false return has no commit to point at — so
// a model that finished the whole job can still omit it, and treating the gap as
// failure throws away the most expensive work the driver does. Trust git over
// the envelope: HEAD past the base means it committed, whatever it remembered to
// report. An unmoved HEAD still yields '' so a genuine no-op defers as before.
export function resolveImplSha({ reported, head, baseSha }) {
  if (reported) return reported;
  return head && head !== baseSha ? head : '';
}

// Every env knob that changes how a run behaves, and is therefore part of that
// run's relaunch command. ONE list with two consumers, deliberately: overnight.mjs
// bakes these into the tmux job (tmux does not reliably inherit arbitrary env),
// and burndown.mjs records them to .audit-work/launch-command so a later session
// can recover them. Keeping two lists in sync by hand already failed once — the
// EFFORT_* knobs were added to the driver and missed here, which would have
// dropped them silently under tmux. Add new knobs here and both paths get them.
export const LAUNCH_KNOBS = [
  'RESUME',
  'PUSH_EVERY',
  'BRANCH',
  'CHECK_CMD',
  'TEST_CMD',
  'E2E_CMD',
  'LINT_CMD',
  'PUSH_TEST_CMD',
  'MAX_DEFERRALS',
  'RETRIES',
  'MODEL_VERIFY',
  'MODEL_IMPL',
  'MODEL_IMPL_MINOR',
  'MODEL_REVIEW',
  'BUDGET_VERIFY',
  'BUDGET_IMPL',
  'BUDGET_REVIEW',
  'EFFORT_VERIFY',
  'EFFORT_IMPL',
  'EFFORT_REVIEW',
];

export const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

// The command that relaunches this exact run, reconstructed from the driver's own
// environment. It cannot be recovered from the process list: overnight.mjs launches
// via `env VAR=… node …`, and `env` EXECS node, so the assignments live in the
// environment and never appear in argv. On macOS the surviving `caffeinate` parent
// happens to retain the full string in its own argv; on Linux caffeinate is not
// used and nothing retains it, so scraping `ps` there recovers nothing at all.
export function launchCommand(env = process.env) {
  const overrides = LAUNCH_KNOBS.filter((knob) => env[knob] != null).map(
    (knob) => `${knob}=${shellQuote(env[knob])}`
  );
  const count = env.MAX_ISSUES ?? '600';
  return `${overrides.join(' ')}${overrides.length ? ' ' : ''}npm run audit:burndown:overnight -- ${count}`;
}

// Which role actually failed, for the docs/AUDIT-DEFERRED.md commit message.
// Rolling unreviewed or ungated work back is always right; describing it as
// rejected is not. Someone triages this file months later deciding whether to
// re-stage the finding, and "failed adversarial review" on a fix no reviewer
// ever saw sends them looking for a quality problem that does not exist. The
// order matters: a reviewer that never ran, and an implementer that never
// delivered, both take precedence over a stale gate result from an earlier
// round. Only a real CHANGES_REQUIRED verdict is attributed to the reviewer.
export function deferralReason({ reviewUnavailable, implFailed, gateRed }) {
  if (reviewUnavailable) return 'reviewer unavailable';
  if (implFailed) return 'implementer failed to deliver a fix round';
  return gateRed?.reason ?? 'failed adversarial review';
}

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
