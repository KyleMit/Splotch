// burndown.mjs — drive the audit burndown with one isolated agent session per
// role per issue (verify → implement → adversarial review → fix). Claude Code
// and Codex are runner backends; this script is the orchestrator. State lives
// in docs/AUDIT.md and git, so a crash costs one iteration, not the run.
//
//   npm run audit:burndown                       # canary (MAX_ISSUES=5)
//   MAX_ISSUES=600 MAX_HANDLED=5 npm run audit:burndown
//
// Graceful stop:  touch .audit-work/STOP
// Hard stop:      pkill -TERM -f 'claude -p|codex exec'
//
// Three design points worth knowing before editing (see the burn-down-audits
// skill for the full architecture):
// * The runner's session id is the handoff: the driver passes the
//   implementer's back on fix rounds, so it resumes with its full history
//   instead of re-deriving the change from review text.
// * JSON schemas replace prose parsing: verdicts, SHAs, and review statuses
//   come back typed regardless of runner.
// * The driver never talks to GitHub. It commits and pushes; the supervising
//   agent opens the PR and drains COMMENT_STORE through the GitHub MCP tools.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { hasCommand, sleep } from '../lib/proc.mjs';
import { agentRunnerDefaults, normalizeAgentRunner, runAgentStep } from './agent-runner.mjs';
import {
  auditFile,
  briefIsStale,
  chdirRoot,
  commandFailureOutput,
  countEntries,
  DEFAULT_MAX_ISSUES,
  deferralReason,
  deleteEntryByTitle,
  DRAFT_DIR,
  draftPatchPath,
  ensureWorkDirs,
  entryTitle,
  findingPriority,
  getEntry,
  git,
  gitOk,
  gitOut,
  incompleteAuditCommitPlan,
  implementationCommitMessage,
  launchCommand,
  lintablePaths,
  logLine,
  LOGS,
  needsRulerApply,
  normalizeDraftPatch,
  PROMPTS,
  protectedImplementationPaths,
  reachedHandledLimit,
  removeNewUntrackedPaths,
  renderDeferralNotes,
  resolveImplSha,
  runCmd,
  shellOk,
  shellResult,
  WORK,
} from './lib.mjs';
import { findingProblem } from './comment.mjs';

chdirRoot();
ensureWorkDirs();

// ---- knobs ------------------------------------------------------------------
const MAX_ISSUES = Number(process.env.MAX_ISSUES ?? DEFAULT_MAX_ISSUES); // canary; raise once proven
// A supervised detached segment must stop for CI and comment reconciliation
// after a bounded number of outcomes. Unlike MAX_ISSUES, this counts invalid
// drops and deferrals too. Zero keeps the historical unbounded behavior.
const MAX_HANDLED = Number(process.env.MAX_HANDLED ?? 0);
// Push after EVERY finding. The run lives in an ephemeral cloud container that
// is reclaimed without warning, so an unpushed commit is a commit at risk: the
// only durable artifact is what is on origin. Batching existed to amortise a
// full-suite gate that no longer runs here (see PUSH_TEST_CMD), which leaves
// nothing to amortise — a push is a second, and a lost hour of model work is an
// hour. Raise it only if you are pushing somewhere rate-limited.
const PUSH_EVERY = Number(process.env.PUSH_EVERY ?? 1);
const BRANCH = process.env.BRANCH ?? 'audit/burndown';
const CHECK_CMD = process.env.CHECK_CMD ?? 'npm run check'; // type-check gate, every finding
const TEST_CMD = process.env.TEST_CMD ?? 'npm run test:unit'; // fast-test gate, every finding
const E2E_CMD = process.env.E2E_CMD ?? 'npm run test:e2e -- --retries=1'; // targeted E2E (retry past transient flakes), UI-touching findings only
const LINT_CMD = process.env.LINT_CMD ?? 'npx eslint'; // per-finding lint gate, on the fix's changed files
// Local full-suite gate before a push — OFF by default. Every push lands on the
// draft PR, whose CI runs the whole suite anyway, in parallel, without sitting
// on the critical path of the next finding. Running it locally too would cost
// ~1–2 min per finding to learn the same thing later than CI does. The tradeoff
// is real and deliberate: cross-finding regressions the per-finding targeted
// specs cannot see now surface in CI (asynchronously) rather than blocking the
// push, so the supervising agent has to actually watch CI. Set it to `npm test`
// to restore the blocking local gate.
const PUSH_TEST_CMD = process.env.PUSH_TEST_CMD ?? '';
// Per-commit PR comment records: one line appended the moment its fix lands, for
// the supervising agent to render and post through the GitHub MCP tools. It
// deliberately lives OUTSIDE git — a tracked file would be caught by the
// rollback paths' `git reset --hard`, which is precisely how pending records
// would get destroyed. Point it at a committed path (and drain + delete that
// file at closeout) when a run will go unwatched long enough that losing the
// container would matter.
const COMMENT_STORE = process.env.COMMENT_STORE ?? join(WORK, 'pending-comments.jsonl');
const MAX_DEFERRALS = Number(process.env.MAX_DEFERRALS ?? 3); // consecutive deferrals before halting
// Total attempts per agent step on a transient failure — N-1 retries. Named
// RETRIES as an env var because that knob is published in LAUNCH_KNOBS.
const RETRIES = Number(process.env.RETRIES ?? 3);

// The runner-specific skills set this explicitly. Claude remains the default
// for backward compatibility with existing launch commands.
const AGENT_RUNNER = normalizeAgentRunner(process.env.AGENT_RUNNER);
const RUNNER_DEFAULTS = agentRunnerDefaults(AGENT_RUNNER);
const MODEL_VERIFY = process.env.MODEL_VERIFY ?? RUNNER_DEFAULTS.verifyModel;
const MODEL_IMPL = process.env.MODEL_IMPL ?? RUNNER_DEFAULTS.implementModel;
const MODEL_IMPL_MINOR = process.env.MODEL_IMPL_MINOR ?? RUNNER_DEFAULTS.minorImplementModel;
const MODEL_REVIEW = process.env.MODEL_REVIEW ?? RUNNER_DEFAULTS.reviewModel;

// Claude Code enforces these per-call dollar caps. Codex subscription-backed
// runs have no equivalent CLI switch, so its backend ignores them.
const BUDGET_VERIFY = process.env.BUDGET_VERIFY ?? '3.00';
const BUDGET_IMPL = process.env.BUDGET_IMPL ?? '4.00';
const BUDGET_REVIEW = process.env.BUDGET_REVIEW ?? '3.00';

// Both backends expose reasoning effort. Verify stays medium because an INVALID
// verdict permanently drops a finding; implementation stays high because it
// manufactures the change; review stays medium behind deterministic gates.
const EFFORT_VERIFY = process.env.EFFORT_VERIFY ?? 'medium';
const EFFORT_IMPL = process.env.EFFORT_IMPL ?? 'high';
const EFFORT_REVIEW = process.env.EFFORT_REVIEW ?? 'medium';

// ---- structured output schemas ---------------------------------------------
const SCHEMA_VERIFY = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['VALID', 'INVALID'] },
    reason: { type: 'string' },
    brief_path: { type: 'string' },
    // Playwright specs (relative to web/, e.g. "tests/flows.spec.ts") that
    // exercise this finding's runtime surface — empty for a change with no
    // behavioural surface. The per-finding E2E gate runs exactly these.
    e2e_specs: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'reason', 'brief_path', 'e2e_specs'],
  additionalProperties: false,
};
const SCHEMA_IMPL = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    sha: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['success', 'sha', 'summary'],
  additionalProperties: false,
};
const SCHEMA_REVIEW = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUIRED'] },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'findings'],
  additionalProperties: false,
};

function halt(message) {
  logLine(`HALT: ${message}`);
  process.exit(1);
}

const agentStep = (options) =>
  runAgentStep({
    runner: AGENT_RUNNER,
    maxAttempts: RETRIES,
    root: process.cwd(),
    workDir: WORK,
    logsDir: LOGS,
    runCmd,
    logLine,
    sleep,
    ...options,
  });

function untrackedImplementationPaths() {
  return gitOut('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
}

function changedImplementationPaths() {
  const outputs = [
    gitOut('diff', '--name-only'),
    gitOut('diff', '--cached', '--name-only'),
    untrackedImplementationPaths().join('\n'),
  ];
  return [...new Set(outputs.flatMap((output) => output.split('\n').filter(Boolean)))];
}

function restoreWorktree(baseSha, untrackedBaseline, label) {
  if (git('reset', '-q', '--hard', baseSha).status !== 0)
    halt(`could not restore ${label} worktree to ${baseSha}`);
  const removed = removeNewUntrackedPaths(
    untrackedBaseline,
    untrackedImplementationPaths(),
    (path) => rmSync(path, { force: true })
  );
  if (removed.length)
    logLine(
      `  removed ${removed.length} untracked ${label} file${removed.length === 1 ? '' : 's'}`
    );
}

function commitCodexImplementation({ title, baseSha, round = 0 }) {
  if (AGENT_RUNNER !== 'codex' || gitOut('rev-parse', 'HEAD') !== baseSha) return '';

  let paths = changedImplementationPaths();
  if (paths.length === 0) {
    logLine('  Codex returned success without worktree changes');
    return '';
  }

  const protectedPaths = protectedImplementationPaths(paths);
  if (protectedPaths.length) {
    logLine(`  Codex changed protected audit state: ${protectedPaths.join(', ')}`);
    return '';
  }

  if (needsRulerApply(paths)) {
    const ruler = runCmd('npm', ['run', 'ruler:apply']);
    if (ruler.status !== 0) {
      logLine(`  driver could not apply Ruler: ${commandFailureOutput(ruler)}`);
      return '';
    }
    logLine('  driver applied Ruler outside the nested Codex sandbox');
    paths = changedImplementationPaths();
    const generatedProtectedPaths = protectedImplementationPaths(paths);
    if (generatedProtectedPaths.length) {
      logLine(`  Ruler changed protected audit state: ${generatedProtectedPaths.join(', ')}`);
      return '';
    }
  }

  const add = git('add', '-A', '--', ...paths);
  if (add.status !== 0) {
    logLine(
      `  driver could not stage Codex changes: ${(add.stderr ?? '').trim() || 'git add failed'}`
    );
    return '';
  }
  const commit = git('commit', '-q', '-m', implementationCommitMessage(title, round));
  if (commit.status !== 0) {
    logLine(
      `  driver could not commit Codex changes: ${(commit.stderr ?? '').trim() || 'git commit failed'}`
    );
    return '';
  }

  const sha = gitOut('rev-parse', 'HEAD');
  logLine(`  driver committed Codex worktree ${sha.slice(0, 12)}`);
  return sha;
}

// ---- deferral ---------------------------------------------------------------
const DEFERRED_FILE = 'docs/AUDIT-DEFERRED.md';
const DEFERRED_HEADER = `# Audit — deferred findings

> Findings the scripted audit burndown (the \`burn-down-audits\` skill) moved aside instead of
> fixing — the verifier was unavailable, the implementation failed, or the change never passed
> adversarial review. Each needs human triage: re-stage it in \`docs/AUDIT.md\`, file it as an
> issue, or drop it.
`;

let deferred = 0;
let consecutive = 0;

// Two findings whose titles slug to the same 72 characters would otherwise have
// the second silently overwrite the first — losing a draft is the exact failure
// this capture exists to prevent, so suffix instead.
function uniqueDraftPath(title) {
  const base = draftPatchPath(title);
  if (!existsSync(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = base.replace(/\.patch$/, `-${n}.patch`);
    if (!existsSync(candidate)) return candidate;
  }
}

// `notes` carries what only this moment knows: the reviewer's unresolved
// objections, the implementer's account of each round, and the draft diff —
// captured BEFORE the caller's `git reset --hard`, because the draft's commits
// are unreachable afterwards and the role envelopes do not survive the next run.
function defer(title, why, notes = {}) {
  const entry = readFileSync(join(WORK, 'current-issue.md'), 'utf8');
  const { draftPatch = '', draftCommits = 0, ...rest } = notes;
  const patchPath = draftPatch.trim() ? uniqueDraftPath(title) : '';
  if (patchPath) {
    mkdirSync(DRAFT_DIR, { recursive: true });
    writeFileSync(patchPath, normalizeDraftPatch(draftPatch));
  }
  const existing = existsSync(DEFERRED_FILE)
    ? readFileSync(DEFERRED_FILE, 'utf8')
    : DEFERRED_HEADER;
  const record = renderDeferralNotes({ ...rest, why, patchPath, draftCommits });
  writeFileSync(
    DEFERRED_FILE,
    `${existing.replace(/\n*$/, '\n\n')}${entry.replace(/\n*$/, '\n')}\n${record}`
  );
  // The header + appended entries aren't wrapped at dprint's width, which would
  // redden CI's Quality (format) job. Normalise before it goes into the commit.
  runCmd('npx', ['dprint', 'fmt', DEFERRED_FILE]);
  deleteEntryByTitle(title);
  git('add', 'docs/AUDIT.md', DEFERRED_FILE);
  if (patchPath) git('add', patchPath);
  git('commit', '-q', '-m', `chore(audit): defer — ${why}\n\nAudit: ${title}`);
  deferred += 1;
  consecutive += 1;
  // A deferral is a commit like any other and has to count toward the push
  // cadence. It did not, so a run whose last finding deferred exited with that
  // commit sitting unpushed — the exit flush is guarded on `sincePush > 0`, and
  // nothing had incremented it. Observed on the 2026-07-25 smoke run. Both
  // non-fix outcomes `continue` past the loop's own push check, so they push
  // here instead; `pushBatch` is a hoisted declaration.
  sincePush += 1;
  if (sincePush >= PUSH_EVERY) pushBatch();
  logLine(`  DEFERRED (${why})`);
  if (consecutive >= MAX_DEFERRALS) halt(`${MAX_DEFERRALS} consecutive deferrals`);
}

// ---- deterministic gates ----------------------------------------------------
// The layered gate, run by the driver on every implementer commit BEFORE the
// adversarial review. Two things follow from that ordering:
//
//   * A red tree comes back to the implementer as a fix round it can still
//     recover from, instead of discarding a finished finding at the very end.
//   * The reviewer only ever sees a finding range whose head already passes, so
//     it does not re-run any of this — it reviews the diff. Re-running was the single
//     largest slice of review wall-clock and bought nothing the driver's own
//     run doesn't already guarantee (see prompts/reviewer.md).
//
// Returns null when green, else { reason, detail, output }: `reason` is the
// deferral label a human reads months later in docs/AUDIT-DEFERRED.md;
// `detail` and the bounded command output are what the implementer gets.
function gateFailure(baseSha, specs) {
  const runGate = (command, reason, detail) => {
    const result = shellResult(command);
    return result.status === 0 ? null : { reason, detail, output: commandFailureOutput(result) };
  };

  const checkFailure = runGate(CHECK_CMD, 'fix broke the type-check', `${CHECK_CMD} is red`);
  if (checkFailure) return checkFailure;

  const testFailure = runGate(TEST_CMD, 'fix broke the test suite', `${TEST_CMD} is red`);
  if (testFailure) return testFailure;

  // Targeted E2E — only for findings the verifier flagged as touching a runtime
  // surface. Catches a behavioural regression attributed to this one finding,
  // without paying full-suite E2E per finding; the batch push still runs it all.
  if (specs.length) {
    const e2eFailure = runGate(
      `${E2E_CMD} ${specs.join(' ')}`,
      'fix broke a targeted E2E spec',
      `the Playwright spec(s) ${specs.join(' ')} are red`
    );
    if (e2eFailure) return e2eFailure;
  }

  // Lint is a separate axis from the type-check: a fix can satisfy CHECK_CMD yet
  // ship a stray `any` or a raw Map in a .svelte.ts and redden CI's Quality job.
  const lintable = lintablePaths(
    gitOut('diff', '--name-only', baseSha, 'HEAD').split('\n'),
    existsSync
  );
  if (lintable.length) {
    const lintFailure = runGate(
      `${LINT_CMD} ${lintable.join(' ')}`,
      'fix introduced a lint violation',
      `${LINT_CMD} is red on ${lintable.join(' ')}`
    );
    if (lintFailure) return lintFailure;
  }
  return null;
}

// ---- preflight & resume recovery -------------------------------------------
// A run is fully resumable from git + docs/AUDIT.md alone, so a brand-new session
// (even a fresh container, with no .audit-work/) can pick up exactly where a
// crashed one stopped. RESUME=1 additionally clears crash residue that would
// otherwise block startup; the unattended launcher sets it. See "Resuming a
// crashed run" in the burn-down-audits skill.
const RESUME = process.env.RESUME === '1' || process.env.RESUME === 'true';

if (!hasCommand(RUNNER_DEFAULTS.binary)) halt(`missing dependency: ${RUNNER_DEFAULTS.binary}`);

// Adopt the branch. A fresh clone has origin/BRANCH but no local BRANCH:
// `git switch -c BRANCH` there would fork a new branch off the current HEAD
// (main) and silently abandon the entire run, so create the local branch FROM
// the remote instead. Fetch first so origin/BRANCH is current.
git('fetch', 'origin', BRANCH); // best-effort: no-op offline or on the very first run
const hasLocal = gitOk('rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`);
const hasRemote = gitOk('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${BRANCH}`);
if (hasLocal) git('switch', BRANCH);
else if (hasRemote) git('switch', '-c', BRANCH, `origin/${BRANCH}`);
else git('switch', '-c', BRANCH);
if (gitOut('rev-parse', '--abbrev-ref', 'HEAD') !== BRANCH) halt(`could not switch to ${BRANCH}`);

// Adopt progress another session/machine pushed, without clobbering local
// unpushed commits: fast-forward to origin/BRANCH only when we're strictly
// behind. A no-op when equal; kept local (logged) when we're ahead or diverged.
if (hasRemote && !gitOk('merge', '--ff-only', `origin/${BRANCH}`))
  logLine(`  note: local ${BRANCH} is ahead of / diverged from origin — keeping local`);

// Recover crash residue. A run killed mid-finding can leave the implementer's
// uncommitted edits (or a half-folded docs/AUDIT.md) in the tree. The finding
// itself is still listed in docs/AUDIT.md — its entry is deleted only inside the
// fix's commit — so resetting to HEAD loses no accepted work; that one finding is
// simply re-processed. Gated behind RESUME so a bare canary run in a dirty repo
// still halts rather than discarding real uncommitted work.
const startupUntracked = untrackedImplementationPaths();
if (!gitOk('diff', '--quiet') || !gitOk('diff', '--cached', '--quiet') || startupUntracked.length) {
  if (!RESUME) halt('working tree is dirty (set RESUME=1 to discard crash residue and resume)');
  logLine('  RESUME: dirty tree from an interrupted run — resetting to HEAD');
  restoreWorktree('HEAD', [], 'crash-residue');
}
if (RESUME) {
  const headSha = gitOut('rev-parse', 'HEAD');
  const rollback = incompleteAuditCommitPlan({
    headSha,
    auditBody: existsSync(auditFile()) ? readFileSync(auditFile(), 'utf8') : '',
    commitAt: (sha) => ({
      message: gitOut('show', '-s', '--format=%B', sha),
      parentSha: gitOut('rev-parse', `${sha}^`),
    }),
  });

  if (rollback) {
    if (hasRemote && gitOk('merge-base', '--is-ancestor', headSha, `origin/${BRANCH}`))
      halt(
        `incomplete implementation for ${rollback.title} is already published; refusing to rewrite origin/${BRANCH}`
      );
    logLine(
      `  RESUME: rewinding ${rollback.count} incomplete implementation commit${
        rollback.count === 1 ? '' : 's'
      } for ${rollback.title}`
    );
    if (git('reset', '-q', '--hard', rollback.baseSha).status !== 0)
      halt(`could not rewind incomplete implementation for ${rollback.title}`);
  }
}
if (RESUME) rmSync(join(WORK, 'STOP'), { force: true }); // a graceful stop leaves STOP behind

if (!shellOk(CHECK_CMD)) halt('tree is already red before we start');

// Fixes and drops are both "handled", but only fixes are work — conflating them
// in the summary makes the closeout AUDIT-LOG row wrong in the flattering
// direction, so they are counted apart.
let done = 0;
let dropped = 0;
let sincePush = 0;

// Push what has been committed. Returns false (commits held locally) if the
// optional full-suite gate or the push itself fails.
//
// The driver does NOT create the PR or post comments — it has no GitHub
// credential and, in a cloud session, not even a github.com remote (origin
// points at a local git proxy, which is why `gh` cannot work here no matter how
// it is authenticated). Both were previously `gh` calls that failed hard and
// silently swallowed a night of per-commit comments. GitHub is now entirely the
// supervising agent's job, via the MCP tools; the driver's contract is commits
// on origin plus the comment records staged in COMMENT_STORE.
function pushBatch({ final = false } = {}) {
  if (PUSH_TEST_CMD && !shellOk(PUSH_TEST_CMD)) {
    logLine(
      final
        ? `  ${PUSH_TEST_CMD} red on the final batch — commits held locally, not pushed`
        : `  ${PUSH_TEST_CMD} red at batch boundary — holding push, will retry next batch`
    );
    return false;
  }
  if (!gitOk('push', '-u', 'origin', BRANCH)) {
    logLine('  push failed — continuing, will retry next batch');
    return false;
  }
  sincePush = 0;
  return true;
}

// Record how this run was launched, while the process that knows still exists.
// Nothing else can recover it: overnight.mjs launches via `env VAR=… node …`, and
// `env` execs node, so the overrides live in the environment and never reach argv,
// leaving nothing for `ps` to scrape. This file is what
// the Claude compaction hook and runner-specific durable checkpoints read, and
// it is the one fact a later supervising session genuinely cannot re-derive.
//
// It is written HERE, below every halt() gate, and not up in preflight: halt()
// exits without restoring the file, so a launch that dies on a missing binary, a
// dirty tree, or an already-red check would otherwise overwrite the record of a
// run that is still going — handing the operator a defaults-only command labelled
// "every non-default override, verbatim". Only a run that actually starts records
// itself. The pid goes in its own file so launch-command stays a pasteable line;
// the snapshot hook cross-checks it against the driver pid it finds in `pgrep`.
writeFileSync(join(WORK, 'launch-command'), `${launchCommand(process.env, MAX_ISSUES)}\n`);
writeFileSync(join(WORK, 'launch-pid'), `${process.pid}\n`);

logLine(
  `starting — target ${MAX_ISSUES} fixes${
    MAX_HANDLED > 0 ? `, ${MAX_HANDLED}-handled checkpoint` : ''
  } on ${BRANCH} via ${AGENT_RUNNER}`
);

// =============================================================================
while (done < MAX_ISSUES) {
  if (existsSync(join(WORK, 'STOP'))) {
    logLine('STOP file present — exiting cleanly');
    break;
  }
  if (reachedHandledLimit({ fixed: done, dropped, deferred, maxHandled: MAX_HANDLED })) {
    logLine(`handled checkpoint reached — ${done + dropped + deferred} outcomes; exiting cleanly`);
    break;
  }

  const tag = `iter${String(done + deferred + 1).padStart(4, '0')}`;

  // ---- 1. POP ---------------------------------------------------------------
  const issue = getEntry();
  if (issue === null) {
    logLine('backlog empty');
    break;
  }
  const issuePath = join(WORK, 'current-issue.md');
  const briefPath = join(WORK, 'current-brief.md');
  writeFileSync(issuePath, `${issue}\n`);
  const issueWrittenAt = statSync(issuePath).mtimeMs;
  const title = entryTitle(issue.split('\n', 1)[0]);
  const remaining = countEntries();
  logLine(`${tag}  (${remaining} remaining)  ${title}`);

  // ---- 2. VERIFY ------------------------------------------------------------
  const verify = await agentStep({
    tag: `${tag}.verify`,
    prompt: 'Verify the finding in .audit-work/current-issue.md against HEAD.',
    systemPromptFile: join(PROMPTS, 'verifier.md'),
    model: MODEL_VERIFY,
    effort: EFFORT_VERIFY,
    role: 'verify',
    schema: SCHEMA_VERIFY,
    maxTurns: 40,
    budget: BUDGET_VERIFY,
  });
  if (!verify.ok) {
    defer(title, 'verifier unavailable');
    continue;
  }
  const verdict = verify.structured.verdict ?? 'ERROR';

  if (verdict === 'INVALID') {
    const reason = verify.structured.reason ?? 'no reason given';
    logLine(`  INVALID: ${reason}`);
    deleteEntryByTitle(title);
    git('add', 'docs/AUDIT.md');
    git(
      'commit',
      '-q',
      '-m',
      `chore(audit): drop invalid finding\n\nAudit: ${title}\nReason: ${reason}`
    );
    appendFileSync(
      join(WORK, 'completed.log'),
      `${gitOut('rev-parse', 'HEAD')}  [invalid]  ${title}\n`
    );
    dropped += 1;
    sincePush += 1;
    consecutive = 0;
    // Same reason as in defer(): this path `continue`s past the loop's push
    // check, so a run ending on a drop would leave that commit unpushed.
    if (sincePush >= PUSH_EVERY) pushBatch();
    continue;
  }
  if (verdict !== 'VALID') {
    defer(title, 'verifier gave no usable verdict');
    continue;
  }

  // A VALID verdict is only actionable if the verifier actually wrote this
  // finding's brief; otherwise the implementer opens the previous finding's
  // one. See briefIsStale — deferring here is a cheap, honest loss, whereas
  // proceeding mis-attributes a commit and destroys an unrelated finding.
  if (briefIsStale(issueWrittenAt, existsSync(briefPath) ? statSync(briefPath).mtimeMs : null)) {
    logLine('  brief not rewritten for this finding — verifier returned VALID without one');
    defer(title, 'verifier gave no usable brief');
    continue;
  }

  // Targeted E2E for a UI-touching finding (see the per-finding E2E gate in
  // close-out). Sanitize hard: these strings are LLM-authored and reach a
  // shell, so keep only spec-path-shaped values and drop anything else.
  const e2eSpecs = (verify.structured.e2e_specs ?? []).filter(
    (spec) => typeof spec === 'string' && /^[\w./-]+$/.test(spec)
  );
  if (e2eSpecs.length) logLine(`  E2E gate: ${e2eSpecs.join(' ')}`);

  const baseSha = gitOut('rev-parse', 'HEAD');
  const untrackedBeforeImpl = untrackedImplementationPaths();

  // ---- 3. IMPLEMENT ---------------------------------------------------------
  // Impl-model tiering: P4/P5 findings are the mechanical tail (dead code,
  // renames, dedup), where the cheaper model shaves the long pole and the
  // unchanged adversarial review still gates the result. Anything more
  // consequential — or untagged, so unknown — stays on the stronger model.
  const priority = findingPriority(title, issue);
  const implModel = priority !== null && priority >= 4 ? MODEL_IMPL_MINOR : MODEL_IMPL;
  if (implModel !== MODEL_IMPL) logLine(`  impl model: ${implModel} (P${priority})`);

  let impl = await agentStep({
    tag: `${tag}.impl`,
    prompt: 'Implement the fix described in .audit-work/current-brief.md.',
    systemPromptFile: join(PROMPTS, 'implementer.md'),
    model: implModel,
    effort: EFFORT_IMPL,
    role: 'implement',
    schema: SCHEMA_IMPL,
    maxTurns: 80,
    budget: BUDGET_IMPL,
  });

  // The backend returns the implementer's authoritative session handle: a
  // driver-minted Claude id or Codex's `thread.started` id. Addressing by
  // session id rather than by agent name makes hundreds of iterations safe.
  const implSession = impl.sessionId ?? '';
  const reportedSha = AGENT_RUNNER === 'codex' ? '' : (impl.structured.sha ?? '');
  const headAfterImpl = impl.structured.success === true ? gitOut('rev-parse', 'HEAD') : '';
  const driverSha =
    impl.ok && impl.structured.success === true && headAfterImpl === baseSha
      ? commitCodexImplementation({ title, baseSha })
      : '';
  let sha = resolveImplSha({
    reported: reportedSha,
    head: driverSha || headAfterImpl,
    baseSha,
  });
  if (sha && !reportedSha) logLine(`  implementer omitted its sha — recovered ${sha.slice(0, 12)}`);

  if (!impl.ok || impl.structured.success !== true || !sha) {
    logLine(`  implementer failed — restoring ${baseSha}`);
    // Its own account of why — routinely the most useful thing on the record,
    // because a brief that cannot be executed (a proposed fix that does not
    // compile, a stale brief) reads as a model failure until you see the reason.
    const tried = [(impl.structured.summary ?? '').trim()].filter(Boolean);
    restoreWorktree(baseSha, untrackedBeforeImpl, 'implementation');
    defer(title, 'implementation failed', { tried });
    continue;
  }

  // Captured for the per-commit PR comment: the implementer's own summary of the
  // fix, and every adversarial catch that forces a revision before approval.
  //
  // Accumulated across rounds rather than captured once. `impl` is reassigned on
  // every fix round, so a single read here describes the FIRST commit while the
  // comment is published against the final one — and when a round changed the
  // approach rather than patching it, that description is not merely stale but
  // wrong about the code it sits under.
  const fixSummaries = [];
  const captureSummary = () => {
    const text = (impl.structured.summary ?? '').trim();
    if (text) fixSummaries.push(text);
  };
  captureSummary();
  const reviewCatches = [];

  // ---- 4/5. REVIEW, at most two fix rounds ----------------------------------
  const brief = existsSync(briefPath) ? readFileSync(briefPath, 'utf8') : '';
  const acceptanceAt = brief.split('\n').findIndex((line) => /acceptance/i.test(line));
  const acceptance =
    acceptanceAt === -1
      ? ''
      : brief
          .split('\n')
          .slice(acceptanceAt, acceptanceAt + 40)
          .join('\n');

  let status = 'CHANGES_REQUIRED';
  let reviewUnavailable = false;
  let implFailed = false;
  let fixRounds = 0;
  let gateRed = null;
  for (let round = 1; round <= 3; round++) {
    // Gate BEFORE reviewing. The reviewer is expensive and read-only, so there
    // is nothing to gain from spending it on a commit the driver is about to
    // roll back — and a red gate caught here is still recoverable, because the
    // implementer is holding the same session and can fix it in a fix round.
    gateRed = gateFailure(baseSha, e2eSpecs);
    let feedback;

    if (gateRed) {
      logLine(`  round ${round}: gates red — ${gateRed.detail}`);
      status = 'CHANGES_REQUIRED';
      feedback = `- The commit does not pass the driver's gates: ${gateRed.detail}. Fix that before anything else; the fix is discarded if it never goes green.\n\nDriver-captured failure output:\n${gateRed.output}`;
    } else {
      const review = await agentStep({
        tag: `${tag}.review${round}`,
        prompt: `Adversarially review the complete finding range ${baseSha}..${sha}. The head commit is ${sha}.\n\nThe original finding this fix must resolve:\n${issue}\n\nAcceptance criteria the verifier derived from it (which may themselves be mis-scoped):\n${acceptance}`,
        systemPromptFile: join(PROMPTS, 'reviewer.md'),
        model: MODEL_REVIEW,
        effort: EFFORT_REVIEW,
        role: 'review',
        schema: SCHEMA_REVIEW,
        maxTurns: 50,
        budget: BUDGET_REVIEW,
      });
      // A reviewer that never ran (budget/turn cap, API error) has not rejected
      // anything — it produced no verdict at all. Recording that as
      // CHANGES_REQUIRED would roll the fix back and file it under "failed
      // adversarial review", telling whoever triages the deferral that the work
      // was judged and found wanting when nothing ever looked at it. Roll back
      // either way (unreviewed work must not ship) but say which happened.
      if (!review.ok) {
        reviewUnavailable = true;
        break;
      }
      status = review.structured.status ?? 'CHANGES_REQUIRED';
      if (status === 'APPROVED') break;

      // Only real reviewer findings become PR-comment "catches" — a red gate is
      // the driver's own bookkeeping, not an adversarial catch worth publishing.
      const roundFindings = review.structured.findings ?? [];
      reviewCatches.push(...roundFindings);
      feedback = roundFindings.map((f) => `- ${f}`).join('\n');
      logLine(`  round ${round}: changes required`);
    }

    if (round === 3) break;
    fixRounds += 1;

    // Resume the SAME implementer session: it retains its full history —
    // every prior tool call, result, and reasoning step — so it fixes its own
    // work instead of re-deriving the change from the review text.
    //
    // EFFORT_IMPL must stay identical to the initial call above. Effort shapes the
    // rendered prompt, so changing it between turns discards the cached prefix —
    // and this session's prefix is the entire first implementation pass. Escalating
    // effort on a later round looks like an obvious win and would silently pay to
    // re-read everything it already knows.
    // No session id means the first impl call never produced one, so there is no
    // history to resume. Re-deriving the change from the feedback is worse than
    // resuming but far better than trying to resume an empty handle and burning
    // the finding on a retry loop. The resumed path inherits its role prompt;
    // the fallback gets it again.
    if (!implSession)
      logLine(`  round ${round}: no impl session to resume — fixing without history`);

    impl = await agentStep({
      tag: `${tag}.fix${round}`,
      prompt:
        AGENT_RUNNER === 'codex'
          ? `The following must be addressed on commit ${sha}. Address every point, run the permitted non-listener checks, and leave the resulting worktree changes for the driver to commit.\n\n${feedback}`
          : `The following must be addressed on commit ${sha}. Address every point and commit.\n\n${feedback}`,
      systemPromptFile: join(PROMPTS, 'implementer.md'),
      model: implModel,
      effort: EFFORT_IMPL,
      role: 'implement',
      schema: SCHEMA_IMPL,
      maxTurns: 60,
      budget: BUDGET_IMPL,
      sessionId: implSession,
    });
    if (!impl.ok) {
      status = 'CHANGES_REQUIRED';
      implFailed = true;
      break;
    }
    // Same HEAD fallback the first implementer call gets: a role can violate its
    // schema and omit `sha`, and an implementer that finishes the job but omits
    // the field would otherwise have a complete, tested fix reset away. Trust the
    // observable side effect (the commit) over the envelope — a commit cannot
    // forget itself.
    // The base to compare against is the commit under review, NOT this finding's
    // original baseSha: HEAD is already past baseSha from the previous round, so
    // comparing to that would resolve a round that committed nothing back to the
    // same rejected sha and re-review it unchanged.
    const reportedFixSha = AGENT_RUNNER === 'codex' ? '' : (impl.structured.sha ?? '');
    const headAfterFix = impl.structured.success === true ? gitOut('rev-parse', 'HEAD') : '';
    const driverFixSha =
      impl.structured.success === true && headAfterFix === sha
        ? commitCodexImplementation({ title, baseSha: sha, round })
        : '';
    const newSha = resolveImplSha({
      reported: reportedFixSha,
      head: driverFixSha || headAfterFix,
      baseSha: sha,
    });
    if (!newSha) {
      status = 'CHANGES_REQUIRED';
      implFailed = true;
      break;
    }
    sha = newSha;
    // What this round changed to clear the rejection. The reviewer's catches are
    // published separately; this is the implementer's account of answering them.
    captureSummary();
  }

  // ---- 6. CLOSE OUT ---------------------------------------------------------
  // Anything that reaches here APPROVED has already cleared the gates: they run
  // at the top of every round on the very commit the reviewer then read, and the
  // reviewer cannot mutate the tree. So there is nothing left to re-run — only
  // the post-amend CHECK_CMD below, which guards the amend itself.
  if (status !== 'APPROVED') {
    const reason = deferralReason({ reviewUnavailable, implFailed, gateRed });
    const why = reviewUnavailable
      ? 'reviewer never returned a verdict'
      : gateRed && !implFailed
        ? `gates red at the final round (${gateRed.detail})`
        : `${reason} after ${fixRounds} fix round${fixRounds === 1 ? '' : 's'}`;
    logLine(`  ${why} — rolling back to ${baseSha}`);
    // Captured before the reset: afterwards the draft's commits are unreachable
    // and only a reflog that dies with the container still names them.
    const draftPatch =
      sha && sha !== baseSha
        ? gitOut('diff', baseSha, sha, '--', '.', `:(exclude)${auditFile()}`)
        : '';
    const draftCommits = draftPatch
      ? gitOut('rev-list', '--count', `${baseSha}..${sha}`).trim()
      : 0;
    restoreWorktree(baseSha, untrackedBeforeImpl, 'implementation');
    defer(title, reason, {
      catches: reviewCatches,
      tried: fixSummaries,
      gateDetail: gateRed && !implFailed ? gateRed.detail : '',
      draftPatch,
      draftCommits: Number(draftCommits) || 0,
    });
    continue;
  }

  // Fold the AUDIT.md deletion into the final commit so the file is always an
  // exact record of what remains and a crash leaves nothing to reconcile.
  // Keyed on the title: a role that deleted the entry itself (which the prompts
  // forbid, but the reviewer talked the implementer into it three times on the
  // 2026-07-25 canary) makes this a no-op instead of eating the next finding.
  if (!deleteEntryByTitle(title)) logLine('  entry already gone — a role edited the audit file');
  git('add', 'docs/AUDIT.md');
  git('commit', '-q', '--amend', '--no-edit');
  sha = gitOut('rev-parse', 'HEAD');

  if (!shellOk(CHECK_CMD)) halt(`tree went red after ${tag} (${sha})`);

  logLine(`  DONE  ${sha.slice(0, 12)}`);
  appendFileSync(join(WORK, 'completed.log'), `${sha}  ${title}\n`);
  // Written the instant the fix lands, not held in memory until a push: the
  // previous version accumulated records in an array and only spilled them to
  // disk when it found it had no PR, so a kill between two pushes took every
  // reviewer catch since the last one with it.
  appendFileSync(
    COMMENT_STORE,
    `${JSON.stringify({
      sha,
      title,
      problem: findingProblem(issue),
      fix: fixSummaries,
      catches: reviewCatches,
      e2eSpecs,
    })}\n`
  );
  done += 1;
  sincePush += 1;
  consecutive = 0;

  // ---- 7. PUSH --------------------------------------------------------------
  // Every finding by default. The commit is the durable artifact and the
  // container is not, so there is no reason to sit on one.
  if (sincePush >= PUSH_EVERY) pushBatch();
}

// ---- finish -----------------------------------------------------------------
// Flush anything the last boundary held back (a failed push, or PUSH_EVERY > 1).
if (sincePush > 0) pushBatch({ final: true });

// Retire the compaction snapshot: nothing else deletes it, and its reader hook
// would otherwise announce "a burndown was in progress" to every post-compaction
// session on this machine forever. Only the compact-snapshot goes — launch-command
// stays, since recovering a finished run's overrides is exactly what it is for.
rmSync(join(WORK, 'compact-snapshot.md'), { force: true });

logLine(
  `finished: ${done} fixed, ${dropped} dropped, ${deferred} deferred, ${countEntries()} remaining`
);
