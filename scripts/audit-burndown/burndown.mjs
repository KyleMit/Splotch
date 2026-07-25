// burndown.mjs — drive the audit burndown with one `claude -p` session per
// role per issue (verify → implement → adversarial review → fix). This script
// is the orchestrator; no subagents, no shared context, no compaction. State
// lives in docs/AUDIT.md and git, so a crash costs one iteration, not the run.
//
//   npm run audit:burndown                       # canary (MAX_ISSUES=5)
//   MAX_ISSUES=600 npm run audit:burndown        # full run
//
// Graceful stop:  touch .audit-work/STOP
// Hard stop:      pkill -TERM -f 'claude -p'
//
// Three design points worth knowing before editing (see the burn-down-audits
// skill for the full architecture):
// * `--resume` is the handoff: the driver MINTS each role's session id with
//   `--session-id` and passes the implementer's back on fix rounds, so it
//   resumes with its full history instead of re-deriving the change from review
//   text. Minting rather than reading `session_id` back off the envelope is
//   load-bearing — see claudeStep.
// * `--json-schema` replaces prose parsing: verdicts, SHAs, and review
//   statuses come back typed in .structured_output.
// * The driver never talks to GitHub. It commits and pushes; the supervising
//   agent opens the PR and drains COMMENT_STORE through the GitHub MCP tools.

import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { hasCommand, sleep } from '../lib/utils.mjs';
import {
  chdirRoot,
  countEntries,
  DEFAULT_MAX_ISSUES,
  deferralReason,
  deleteEntryByTitle,
  ensureWorkDirs,
  findingPriority,
  getEntry,
  git,
  gitOk,
  gitOut,
  launchCommand,
  logLine,
  LOGS,
  PROMPTS,
  resolveImplSha,
  runCmd,
  shellOk,
  WORK,
} from './lib.mjs';
import { findingProblem } from './comment.mjs';

chdirRoot();
ensureWorkDirs();

// ---- knobs ------------------------------------------------------------------
const MAX_ISSUES = Number(process.env.MAX_ISSUES ?? DEFAULT_MAX_ISSUES); // canary; raise once proven
// Push after EVERY finding. The run lives in an ephemeral cloud container that
// is reclaimed without warning, so an unpushed commit is a commit at risk: the
// only durable artifact is what is on origin. Batching existed to amortise a
// full-suite gate that no longer runs here (see PUSH_TEST_CMD), which leaves
// nothing to amortise — a push is a second, and a lost hour of Opus work is an
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
const RETRIES = Number(process.env.RETRIES ?? 3); // retries for transient claude failures

// Impl/review are pinned to the explicit Opus 5 id, not the `opus` alias: the
// alias still resolves to opus-4-8 in this environment, so the pin is what
// actually moves both roles onto Opus 5 (verify stays on Sonnet 5 — the `sonnet`
// alias already resolves there). Override with MODEL_* to tier for cost/speed.
const MODEL_VERIFY = process.env.MODEL_VERIFY ?? 'sonnet';
const MODEL_IMPL = process.env.MODEL_IMPL ?? 'claude-opus-5';
const MODEL_IMPL_MINOR = process.env.MODEL_IMPL_MINOR ?? 'sonnet'; // P4/P5 mechanical tail
const MODEL_REVIEW = process.env.MODEL_REVIEW ?? 'claude-opus-5';

const BUDGET_VERIFY = process.env.BUDGET_VERIFY ?? '3.00'; // verify reads a lot of code; $1 capped complex findings and clustered deferrals (2026-07-24 retro)
const BUDGET_IMPL = process.env.BUDGET_IMPL ?? '4.00';
const BUDGET_REVIEW = process.env.BUDGET_REVIEW ?? '3.00'; // $2 capped a P4 review mid-verdict, discarding a sound fix (2026-07-24 retro)

// Effort (`claude --effort`) is Opus 5's primary cost/latency control, and it
// governs ALL tokens — thinking, prose, and tool calls — so a lower level also
// means fewer tool calls, not just shorter reasoning. Wall-clock, not dollars,
// is what actually bounds a 600-finding run, which makes this the highest-value
// knob here. Anthropic's Opus 5 guidance is to use low/medium liberally and
// step up only where evals show it buys something.
//   verify  stays mid: an INVALID verdict *deletes a finding permanently*, so
//           it is the one role whose mistakes are unrecoverable.
//   impl    stays high: this is where correctness is actually manufactured.
//   review  runs mid on the documented finding that Opus 5's review accuracy
//           holds at reduced effort, with the deterministic gates as backstop.
// Raise review (and verify) to `high` for a run where correctness dominates.
const EFFORT_VERIFY = process.env.EFFORT_VERIFY ?? 'medium';
const EFFORT_IMPL = process.env.EFFORT_IMPL ?? 'high';
const EFFORT_REVIEW = process.env.EFFORT_REVIEW ?? 'medium';

// ---- tool scopes ------------------------------------------------------------
// TWO different flags, doing two different jobs — both are needed:
//   --tools        which tools EXIST for the session (coarse: `Bash`, no args)
//   --allowedTools which of them run WITHOUT a permission prompt (fine-grained:
//                  `Bash(git show *)`)
// --allowedTools alone does not remove a tool, it only pre-approves one. Left to
// itself every role could still reach `Agent` and `Workflow` and fan out into
// subagents — and Opus 5 delegates markedly more readily than earlier models, so
// a role that starts spawning agents burns its whole BUDGET_* before doing any
// work, and budget caps are already this driver's main deferral source. Each
// role gets exactly the tools its job needs and nothing else; delegation, web
// access, and background tasks are simply absent rather than discouraged in
// prose. Verified: with --tools set, `Agent`/`Workflow`/`WebFetch` do not appear
// in the session's tool list at all.
const AVAIL_VERIFY = 'Read,Grep,Glob,Write,Bash';
const AVAIL_IMPL = 'Read,Edit,Write,Grep,Glob,Bash';
const AVAIL_REVIEW = 'Read,Grep,Glob,Bash';

// NOTE the space before each '*'. `Bash(git diff *)` prefix-matches correctly;
// `Bash(git diff*)` would also match `git diff-index`.
// Also note: acceptEdits auto-approves file writes and common fs commands
// (mkdir/touch/mv/cp) but NOT other shell commands — npm and git must be listed.
const TOOLS_VERIFY =
  'Read,Grep,Glob,Write,Bash(git show *),Bash(git log *),Bash(git rev-parse *),Bash(rg *),Bash(grep *),Bash(mkdir *)';
const TOOLS_IMPL =
  'Read,Edit,Write,Grep,Glob,Bash(npm *),Bash(npx *),Bash(node *),Bash(git add *),Bash(git commit *),Bash(git status *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git rev-parse *),Bash(rg *),Bash(grep *)';
// The reviewer deliberately has NO npm/npx: the driver has already run the
// type-check, unit tests, lint and targeted E2E on this exact commit before the
// review starts, so a reviewer re-running them can only confirm what is already
// known — at Opus rates, on the critical path of every finding. Withholding the
// commands enforces that structurally instead of asking the model nicely.
const TOOLS_REVIEW =
  'Read,Grep,Glob,Bash(git show *),Bash(git diff *),Bash(git log *),Bash(git rev-parse *),Bash(rg *),Bash(grep *)';

// ---- structured output schemas ---------------------------------------------
const SCHEMA_VERIFY = JSON.stringify({
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
  required: ['verdict', 'reason'],
});
const SCHEMA_IMPL = JSON.stringify({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    sha: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['success', 'summary'],
});
const SCHEMA_REVIEW = JSON.stringify({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUIRED'] },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['status'],
});

function halt(message) {
  logLine(`HALT: ${message}`);
  process.exit(1);
}

// ---- claude invocation with backoff ----------------------------------------
// Distinguishes a transient failure (network blip, rate limit, overload) from
// a real answer. WITHOUT this, a 20-minute outage at 2am trips the consecutive
// deferral limit and you wake to 40 issues done instead of 300.
// Returns { ok, env, sessionId } where env is the parsed JSON envelope (or {})
// and sessionId is the id this call ran under ('' on a --resume call, which
// inherits one).
//
// EVERY fresh role call gets a minted `--session-id`, and the resume handle is
// that minted id — NOT `env.session_id` read back off the envelope. This is not
// belt-and-braces; it is the only thing that makes the handoff work in a cloud
// session. Claude Code on the web pins CLAUDE_CODE_SESSION_ID in the container
// environment, every `claude -p` child inherits it, and all of them then report
// the SAME session_id and append to ONE transcript file. `--resume <that id>`
// resolves to whatever wrote to that transcript last — which, at a fix round, is
// the reviewer that just rejected the work, or even the supervising agent's own
// tool output. The 2026-07-25 canary confirmed it: both fix rounds resumed the
// reviewer's leaf, so the implementer was handed the critic's context instead of
// its own and the blind writer/verifier pairing was silently void. Unsetting the
// env var does not help; minting the id does.
//
// A fresh id per ATTEMPT, not per call: a retry that reused the id of a partial
// session would collide with it.
async function claudeStep(tag, args) {
  let env = {};
  let sessionId = '';
  const resuming = args.includes('--resume');
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const idArgs = [];
    if (!resuming) {
      sessionId = randomUUID();
      idArgs.push('--session-id', sessionId);
    }
    const result = runCmd('claude', ['-p', ...args, ...idArgs, '--output-format', 'json']);
    const out = result.stdout ?? '';
    writeFileSync(join(LOGS, `${tag}.json`), out);
    if (result.stderr) appendFileSync(join(LOGS, `${tag}.err`), result.stderr);

    try {
      env = out ? JSON.parse(out) : {};
    } catch {
      env = {};
    }
    if (out && env.is_error !== true && result.status === 0) return { ok: true, env, sessionId };

    const subtype = env.subtype ?? 'no_output';
    if (subtype === 'error_max_budget_usd' || subtype === 'error_max_turns') {
      // A cap is a real answer, not a blip. Don't burn retries on it.
      logLine(`  ${tag} hit a cap (${subtype}) — not retrying`);
      return { ok: false, env, sessionId };
    }

    const wait = attempt * attempt * 30;
    logLine(`  ${tag} attempt ${attempt}/${RETRIES} failed (${subtype}) — backing off ${wait}s`);
    await sleep(wait * 1000);
  }
  return { ok: false, env, sessionId };
}

const structured = (env) => env.structured_output ?? {};

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

function defer(title, why) {
  const entry = readFileSync(join(WORK, 'current-issue.md'), 'utf8');
  const existing = existsSync(DEFERRED_FILE)
    ? readFileSync(DEFERRED_FILE, 'utf8')
    : DEFERRED_HEADER;
  writeFileSync(DEFERRED_FILE, `${existing.replace(/\n*$/, '\n\n')}${entry.replace(/\n*$/, '\n')}`);
  // The header + appended entries aren't wrapped at dprint's width, which would
  // redden CI's Quality (format) job. Normalise before it goes into the commit.
  runCmd('npx', ['dprint', 'fmt', DEFERRED_FILE]);
  deleteEntryByTitle(title);
  git('add', 'docs/AUDIT.md', DEFERRED_FILE);
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
//   * The reviewer only ever sees a commit that already passes, so it does not
//     re-run any of this — it reviews the diff. Re-running was the single
//     largest slice of review wall-clock and bought nothing the driver's own
//     run doesn't already guarantee (see prompts/reviewer.md).
//
// Returns null when green, else { reason, detail }: `reason` is the deferral
// label a human reads months later in docs/AUDIT-DEFERRED.md, `detail` is what
// the implementer is told to fix.
function gateFailure(baseSha, specs) {
  if (!shellOk(CHECK_CMD))
    return { reason: 'fix broke the type-check', detail: `${CHECK_CMD} is red` };
  if (!shellOk(TEST_CMD))
    return { reason: 'fix broke the test suite', detail: `${TEST_CMD} is red` };
  // Targeted E2E — only for findings the verifier flagged as touching a runtime
  // surface. Catches a behavioural regression attributed to this one finding,
  // without paying full-suite E2E per finding; the batch push still runs it all.
  if (specs.length && !shellOk(`${E2E_CMD} ${specs.join(' ')}`))
    return {
      reason: 'fix broke a targeted E2E spec',
      detail: `the Playwright spec(s) ${specs.join(' ')} are red`,
    };
  // Lint is a separate axis from the type-check: a fix can satisfy CHECK_CMD yet
  // ship a stray `any` or a raw Map in a .svelte.ts and redden CI's Quality job.
  const lintable = gitOut('diff', '--name-only', baseSha, 'HEAD')
    .split('\n')
    .filter((f) => /\.(ts|svelte|mjs|cjs|js)$/.test(f));
  if (lintable.length && !shellOk(`${LINT_CMD} ${lintable.join(' ')}`))
    return {
      reason: 'fix introduced a lint violation',
      detail: `${LINT_CMD} is red on ${lintable.join(' ')}`,
    };
  return null;
}

// ---- preflight & resume recovery -------------------------------------------
// A run is fully resumable from git + docs/AUDIT.md alone, so a brand-new session
// (even a fresh container, with no .audit-work/) can pick up exactly where a
// crashed one stopped. RESUME=1 additionally clears crash residue that would
// otherwise block startup; the unattended launcher sets it. See "Resuming a
// crashed run" in the burn-down-audits skill.
const RESUME = process.env.RESUME === '1' || process.env.RESUME === 'true';

if (!hasCommand('claude')) halt('missing dependency: claude');

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
if (!gitOk('diff', '--quiet') || !gitOk('diff', '--cached', '--quiet')) {
  if (!RESUME) halt('working tree is dirty (set RESUME=1 to discard crash residue and resume)');
  logLine('  RESUME: dirty tree from an interrupted run — resetting to HEAD');
  git('reset', '-q', '--hard', 'HEAD');
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
// .claude/hooks/precompact-burndown-snapshot.sh reads, and it is the one fact a
// post-compaction session genuinely cannot re-derive.
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

logLine(`starting — target ${MAX_ISSUES} issues on ${BRANCH}`);

// =============================================================================
while (done < MAX_ISSUES) {
  if (existsSync(join(WORK, 'STOP'))) {
    logLine('STOP file present — exiting cleanly');
    break;
  }

  const tag = `iter${String(done + deferred + 1).padStart(4, '0')}`;

  // ---- 1. POP ---------------------------------------------------------------
  const issue = getEntry();
  if (issue === null) {
    logLine('backlog empty');
    break;
  }
  writeFileSync(join(WORK, 'current-issue.md'), `${issue}\n`);
  const title = issue.split('\n', 1)[0].replace(/^### /, '');
  const remaining = countEntries();
  logLine(`${tag}  (${remaining} remaining)  ${title}`);

  // ---- 2. VERIFY ------------------------------------------------------------
  const verify = await claudeStep(`${tag}.verify`, [
    'Verify the finding in .audit-work/current-issue.md against HEAD.',
    '--append-system-prompt-file',
    join(PROMPTS, 'verifier.md'),
    '--model',
    MODEL_VERIFY,
    '--effort',
    EFFORT_VERIFY,
    '--tools',
    AVAIL_VERIFY,
    '--allowedTools',
    TOOLS_VERIFY,
    '--permission-mode',
    'acceptEdits',
    '--json-schema',
    SCHEMA_VERIFY,
    '--max-turns',
    '40',
    '--max-budget-usd',
    BUDGET_VERIFY,
  ]);
  if (!verify.ok) {
    defer(title, 'verifier unavailable');
    continue;
  }
  const verdict = structured(verify.env).verdict ?? 'ERROR';

  if (verdict === 'INVALID') {
    const reason = structured(verify.env).reason ?? 'no reason given';
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

  // Targeted E2E for a UI-touching finding (see the per-finding E2E gate in
  // close-out). Sanitize hard: these strings are LLM-authored and reach a
  // shell, so keep only spec-path-shaped values and drop anything else.
  const e2eSpecs = (structured(verify.env).e2e_specs ?? []).filter(
    (spec) => typeof spec === 'string' && /^[\w./-]+$/.test(spec)
  );
  if (e2eSpecs.length) logLine(`  E2E gate: ${e2eSpecs.join(' ')}`);

  const baseSha = gitOut('rev-parse', 'HEAD');

  // ---- 3. IMPLEMENT ---------------------------------------------------------
  // Impl-model tiering: P4/P5 findings are the mechanical tail (dead code,
  // renames, dedup), where the cheaper model shaves the long pole and the
  // unchanged adversarial review still gates the result. Anything more
  // consequential — or untagged, so unknown — stays on the stronger model.
  const priority = findingPriority(title);
  const implModel = priority !== null && priority >= 4 ? MODEL_IMPL_MINOR : MODEL_IMPL;
  if (implModel !== MODEL_IMPL) logLine(`  impl model: ${implModel} (P${priority})`);

  let impl = await claudeStep(`${tag}.impl`, [
    'Implement the fix described in .audit-work/current-brief.md.',
    '--append-system-prompt-file',
    join(PROMPTS, 'implementer.md'),
    '--model',
    implModel,
    '--effort',
    EFFORT_IMPL,
    '--tools',
    AVAIL_IMPL,
    '--allowedTools',
    TOOLS_IMPL,
    '--permission-mode',
    'acceptEdits',
    '--json-schema',
    SCHEMA_IMPL,
    '--max-turns',
    '80',
    '--max-budget-usd',
    BUDGET_IMPL,
  ]);

  // The resume handle is the id the driver MINTED for this call, not the one the
  // envelope reports — in a cloud session those differ, and the envelope's is
  // shared by every role (see claudeStep). Addressing by session id rather than
  // by agent name is what makes hundreds of iterations safe.
  const implSession = impl.sessionId ?? '';
  const reportedSha = structured(impl.env).sha ?? '';
  let sha = resolveImplSha({
    reported: reportedSha,
    head: structured(impl.env).success === true ? gitOut('rev-parse', 'HEAD') : '',
    baseSha,
  });
  if (sha && !reportedSha) logLine(`  implementer omitted its sha — recovered ${sha.slice(0, 12)}`);

  if (!impl.ok || structured(impl.env).success !== true || !sha) {
    logLine(`  implementer failed — restoring ${baseSha}`);
    git('reset', '-q', '--hard', baseSha);
    defer(title, 'implementation failed');
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
    const text = (structured(impl.env).summary ?? '').trim();
    if (text) fixSummaries.push(text);
  };
  captureSummary();
  const reviewCatches = [];

  // ---- 4/5. REVIEW, at most two fix rounds ----------------------------------
  const briefPath = join(WORK, 'current-brief.md');
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
      feedback = `- The commit does not pass the driver's gates: ${gateRed.detail}. Fix that before anything else; the fix is discarded if it never goes green.`;
    } else {
      const review = await claudeStep(`${tag}.review${round}`, [
        `Adversarially review commit ${sha}.\n\nThe original finding this fix must resolve:\n${issue}\n\nAcceptance criteria the verifier derived from it (which may themselves be mis-scoped):\n${acceptance}`,
        '--append-system-prompt-file',
        join(PROMPTS, 'reviewer.md'),
        '--model',
        MODEL_REVIEW,
        '--effort',
        EFFORT_REVIEW,
        '--tools',
        AVAIL_REVIEW,
        '--allowedTools',
        TOOLS_REVIEW,
        '--permission-mode',
        'dontAsk',
        '--json-schema',
        SCHEMA_REVIEW,
        '--max-turns',
        '50',
        '--max-budget-usd',
        BUDGET_REVIEW,
      ]);
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
      status = structured(review.env).status ?? 'CHANGES_REQUIRED';
      if (status === 'APPROVED') break;

      // Only real reviewer findings become PR-comment "catches" — a red gate is
      // the driver's own bookkeeping, not an adversarial catch worth publishing.
      const roundFindings = structured(review.env).findings ?? [];
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
    // No minted id means the first impl call never produced one, so there is no
    // history to resume. Re-deriving the change from the feedback is worse than
    // resuming but far better than `--resume ''`, which just errors out and
    // burns the finding on a retry loop. The resumed path inherits its system
    // prompt from the session, so it is re-supplied only on the fallback.
    const resumeArgs = implSession
      ? ['--resume', implSession]
      : ['--append-system-prompt-file', join(PROMPTS, 'implementer.md')];
    if (!implSession)
      logLine(`  round ${round}: no impl session to resume — fixing without history`);

    impl = await claudeStep(`${tag}.fix${round}`, [
      `The following must be addressed on commit ${sha}. Address every point and commit.\n\n${feedback}`,
      ...resumeArgs,
      '--effort',
      EFFORT_IMPL,
      '--tools',
      AVAIL_IMPL,
      '--allowedTools',
      TOOLS_IMPL,
      '--permission-mode',
      'acceptEdits',
      '--json-schema',
      SCHEMA_IMPL,
      '--max-turns',
      '60',
      '--max-budget-usd',
      BUDGET_IMPL,
    ]);
    if (!impl.ok) {
      status = 'CHANGES_REQUIRED';
      implFailed = true;
      break;
    }
    // Same HEAD fallback the first implementer call gets: `sha` is optional in
    // SCHEMA_IMPL, and an implementer that finishes the job but omits the field
    // would otherwise have a complete, tested fix reset away. Trust the observable
    // side effect (the commit) over the envelope — a commit cannot forget itself.
    // The base to compare against is the commit under review, NOT this finding's
    // original baseSha: HEAD is already past baseSha from the previous round, so
    // comparing to that would resolve a round that committed nothing back to the
    // same rejected sha and re-review it unchanged.
    const newSha = resolveImplSha({
      reported: structured(impl.env).sha ?? '',
      head: structured(impl.env).success === true ? gitOut('rev-parse', 'HEAD') : '',
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
    git('reset', '-q', '--hard', baseSha);
    defer(title, reason);
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
