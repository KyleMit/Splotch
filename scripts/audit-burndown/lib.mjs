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

// The implementer reports the sha of the commit it made. Even with a required
// schema field, a failed call or legacy runner envelope can omit it, and treating
// the gap as failure throws away the most expensive work the driver does. Trust
// git over the envelope: HEAD past the base means it committed, whatever it
// remembered to report. An unmoved HEAD still yields '' so a genuine no-op
// defers as before.
export function resolveImplSha({ reported, head, baseSha }) {
  if (reported) return reported;
  return head && head !== baseSha ? head : '';
}

export function implementationCommitMessage(title, round = 0) {
  const plainTitle =
    String(title ?? '')
      .replace(/^(?:\[[^\]]+\])+\s*/, '')
      .trim() || 'apply verified finding';
  const subject = round
    ? `fix(audit): address review round ${round} for ${plainTitle}`
    : `fix(audit): ${plainTitle}`;
  return `${subject}\n\nAudit: ${title}`;
}

export function protectedImplementationPaths(paths, auditPath = auditFile()) {
  return paths.filter(
    (path) =>
      path === auditPath ||
      path === 'docs/AUDIT-DEFERRED.md' ||
      path.startsWith('docs/audit-deferred/')
  );
}

// Every env knob that changes how a run behaves, and is therefore part of that
// run's relaunch command. ONE list with two consumers, deliberately: overnight.mjs
// bakes these into the detached job's command line, and burndown.mjs records them
// to .audit-work/launch-command so a later session can recover them. Keeping two
// lists in sync by hand already failed twice — the EFFORT_* knobs and AUDIT_FILE
// were added elsewhere and missed here. An omission fails silently and late:
// preflight is spawned directly and inherits the full env, so it passes, and only
// the detached driver runs without the knob. Add new knobs here and both paths
// get them.
export const LAUNCH_KNOBS = [
  'RESUME',
  'AGENT_RUNNER',
  'PUSH_EVERY',
  'BRANCH',
  'AUDIT_FILE',
  'CHECK_CMD',
  'TEST_CMD',
  'E2E_CMD',
  'LINT_CMD',
  'PUSH_TEST_CMD',
  'COMMENT_STORE',
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

// The canary default, shared with burndown.mjs so the recorded relaunch command
// can never disagree with the run it claims to reproduce: an unset MAX_ISSUES
// means a 5-finding canary, and a command reading `-- 600` would relaunch a run
// 120× longer under a heading promising "this exact run".
export const DEFAULT_MAX_ISSUES = 5;

// The command that relaunches this exact run, reconstructed from the driver's own
// environment. It cannot be recovered from the process list: overnight.mjs launches
// via `env VAR=… node …`, and `env` EXECS node, so the assignments live in the
// environment and never appear in argv — nothing retains the string, so scraping
// `ps` recovers nothing at all. The driver passes its own already-resolved
// MAX_ISSUES rather than letting this re-derive one, so the two can't drift apart.
export function launchCommand(env = process.env, maxIssues = env.MAX_ISSUES ?? DEFAULT_MAX_ISSUES) {
  const overrides = LAUNCH_KNOBS.filter((knob) => env[knob] != null).map(
    (knob) => `${knob}=${shellQuote(env[knob])}`
  );
  return `${overrides.join(' ')}${overrides.length ? ' ' : ''}npm run audit:burndown:overnight -- ${maxIssues}`;
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

// The verifier writes .audit-work/current-brief.md itself, and has been seen
// returning VALID without doing so. The driver then hands the implementer the
// PREVIOUS finding's brief while current-issue.md names this one, so anything
// it commits is attributed to — and deletes by title — a finding nobody
// verified or implemented. deleteEntryByTitle cannot catch this one: the title
// it is handed really is the current finding's, and that entry really is
// present. Both observed occurrences were caught only because the implementer
// noticed the mismatch and refused to commit, which is a prompt-level backstop
// rather than a guarantee.
//
// Compared by mtime rather than by having the verifier echo the finding's
// title into the brief: a role that skipped writing the file would skip the
// title too, so a guard needing its cooperation fails in exactly the case it
// exists for. The driver writes current-issue.md itself and the verifier only
// runs afterwards, so this compares two facts the driver owns. A missing brief
// is stale by the same rule.
export function briefIsStale(issueWrittenAtMs, briefMtimeMs) {
  if (typeof briefMtimeMs !== 'number') return true;
  return briefMtimeMs <= issueWrittenAtMs;
}

export const DRAFT_DIR = 'docs/audit-deferred';

export function draftPatchPath(title, dir = DRAFT_DIR) {
  const slug = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/, '');
  return `${dir}/${slug || 'untitled'}.patch`;
}

// What someone triaging docs/AUDIT-DEFERRED.md months later needs and cannot
// reconstruct: which objection actually stopped the fix, what was already
// tried, and where the rejected draft went. All three are in the driver's hands
// at the moment it rolls back and nowhere afterwards — the role envelopes are
// gitignored, container-local, and overwritten by the next run's same-numbered
// iteration, so a deferral that records only its one-line reason throws the
// expensive part away.
export function renderDeferralNotes({
  why = '',
  catches = [],
  tried = [],
  gateDetail = '',
  patchPath = '',
  draftCommits = 0,
} = {}) {
  const out = ['#### Why it was deferred', '', why.trim() || 'No reason recorded.', ''];

  if (gateDetail) out.push(`The driver's gates were red at the final round: ${gateDetail}.`, '');

  if (catches.length) {
    out.push("Reviewer's unresolved objections:", '');
    out.push(...catches.map((c) => `- ${String(c).trim()}`), '');
  }

  if (tried.length) {
    out.push('#### What was tried', '');
    out.push(
      ...tried.map((t, i) =>
        tried.length === 1 ? String(t).trim() : `${i + 1}. ${String(t).trim()}`
      ),
      ''
    );
  }

  if (patchPath) {
    const commits = draftCommits ? ` (${draftCommits} commit${draftCommits === 1 ? '' : 's'})` : '';
    out.push('#### Draft implementation', '');
    out.push(
      `The rolled-back draft is kept at \`${patchPath}\`${commits}. It passed the driver's ` +
        `type-check, unit-test and lint gates — the review is what it did not pass — so it is a ` +
        `starting point rather than scrap. Apply with \`git apply ${patchPath}\`.`,
      ''
    );
  }

  return `${out.join('\n').replace(/\n*$/, '')}\n`;
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

export function shellResult(command) {
  return spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
}

export function commandFailureOutput(result, maxLength = 6000) {
  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .replace(ansiPattern, '')
    .trim();
  if (!output) return `command exited ${result.status ?? 'without a status'}`;
  return output.length <= maxLength ? output : `…${output.slice(-maxLength)}`;
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
  return deleteEntryAt(entryStarts(readLines(file) ?? [])[0], file);
}

// Remove the entry whose heading matches `title` (the heading line minus its
// leading `### `). Returns false when no such entry exists.
//
// The driver deletes by title rather than by position because "delete the first
// entry" is only correct while the entry being worked on is still the first one
// — and a role can invalidate that mid-finding. On the 2026-07-25 canary the
// reviewer rejected three of five fixes for "not deleting the AUDIT.md entry"
// (it saw the excision in neighbouring burndown commits and read its absence as
// an omission), the implementer complied by running `pop.mjs --delete`, and the
// driver's own positional delete then removed what had become the first entry:
// the NEXT, never-verified finding, silently, inside an unrelated fix commit.
// Keying on identity makes that whole class impossible — a duplicated delete is
// now a no-op instead of destroying a finding.
export function deleteEntryByTitle(title, file = auditFile()) {
  const lines = readLines(file);
  if (!lines) return false;
  const start = entryStarts(lines).find((i) => lines[i].replace(/^### /, '') === title);
  return deleteEntryAt(start, file, lines);
}

function deleteEntryAt(start, file, lines = readLines(file)) {
  if (!lines || start === undefined) return false;
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
