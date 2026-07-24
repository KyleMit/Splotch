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
// Two design points worth knowing before editing (see the burn-down-audits
// skill for the full architecture):
// * `--resume` is the handoff: the implementer's session_id is captured from
//   the JSON envelope and passed back on fix rounds, so it resumes with its
//   full history instead of re-deriving the change from review text.
// * `--json-schema` replaces prose parsing: verdicts, SHAs, and review
//   statuses come back typed in .structured_output.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasCommand, sleep } from '../lib/utils.mjs';
import {
  chdirRoot,
  countEntries,
  deleteFirstEntry,
  ensureWorkDirs,
  getEntry,
  git,
  gitOk,
  gitOut,
  logLine,
  LOGS,
  PROMPTS,
  runCmd,
  shellOk,
  WORK,
} from './lib.mjs';

chdirRoot();
ensureWorkDirs();

// ---- knobs ------------------------------------------------------------------
const MAX_ISSUES = Number(process.env.MAX_ISSUES ?? 5); // canary default; raise once proven
const PUSH_EVERY = Number(process.env.PUSH_EVERY ?? 10);
const BRANCH = process.env.BRANCH ?? 'audit/burndown';
const CHECK_CMD = process.env.CHECK_CMD ?? 'npm run check'; // type-check gate, every finding
const TEST_CMD = process.env.TEST_CMD ?? 'npm run test:unit'; // fast-test gate, every finding
const E2E_CMD = process.env.E2E_CMD ?? 'npm run test:e2e --'; // targeted E2E, only UI-touching findings
const PUSH_TEST_CMD = process.env.PUSH_TEST_CMD ?? 'npm test'; // full suite, once per batch before push
const MAX_DEFERRALS = Number(process.env.MAX_DEFERRALS ?? 3); // consecutive deferrals before halting
const RETRIES = Number(process.env.RETRIES ?? 3); // retries for transient claude failures

const MODEL_VERIFY = process.env.MODEL_VERIFY ?? 'sonnet';
const MODEL_IMPL = process.env.MODEL_IMPL ?? 'opus';
const MODEL_REVIEW = process.env.MODEL_REVIEW ?? 'opus';

const BUDGET_VERIFY = process.env.BUDGET_VERIFY ?? '1.00';
const BUDGET_IMPL = process.env.BUDGET_IMPL ?? '4.00';
const BUDGET_REVIEW = process.env.BUDGET_REVIEW ?? '2.00';

// ---- tool scopes ------------------------------------------------------------
// NOTE the space before each '*'. `Bash(git diff *)` prefix-matches correctly;
// `Bash(git diff*)` would also match `git diff-index`.
// Also note: acceptEdits auto-approves file writes and common fs commands
// (mkdir/touch/mv/cp) but NOT other shell commands — npm and git must be listed.
const TOOLS_VERIFY =
  'Read,Grep,Glob,Write,Bash(git show *),Bash(git log *),Bash(git rev-parse *),Bash(rg *),Bash(grep *),Bash(mkdir *)';
const TOOLS_IMPL =
  'Read,Edit,Write,Grep,Glob,Bash(npm *),Bash(npx *),Bash(node *),Bash(git add *),Bash(git commit *),Bash(git status *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git rev-parse *),Bash(rg *),Bash(grep *)';
const TOOLS_REVIEW =
  'Read,Grep,Glob,Bash(git show *),Bash(git diff *),Bash(git log *),Bash(git rev-parse *),Bash(npm run *),Bash(npx *),Bash(rg *),Bash(grep *)';

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
// Returns { ok, env } where env is the parsed JSON envelope (or {}).
async function claudeStep(tag, args) {
  let env = {};
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const result = runCmd('claude', ['-p', ...args, '--output-format', 'json']);
    const out = result.stdout ?? '';
    writeFileSync(join(LOGS, `${tag}.json`), out);
    if (result.stderr) appendFileSync(join(LOGS, `${tag}.err`), result.stderr);

    try {
      env = out ? JSON.parse(out) : {};
    } catch {
      env = {};
    }
    if (out && env.is_error !== true && result.status === 0) return { ok: true, env };

    const subtype = env.subtype ?? 'no_output';
    if (subtype === 'error_max_budget_usd' || subtype === 'error_max_turns') {
      // A cap is a real answer, not a blip. Don't burn retries on it.
      logLine(`  ${tag} hit a cap (${subtype}) — not retrying`);
      return { ok: false, env };
    }

    const wait = attempt * attempt * 30;
    logLine(`  ${tag} attempt ${attempt}/${RETRIES} failed (${subtype}) — backing off ${wait}s`);
    await sleep(wait * 1000);
  }
  return { ok: false, env };
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
  deleteFirstEntry();
  git('add', 'docs/AUDIT.md', DEFERRED_FILE);
  git('commit', '-q', '-m', `chore(audit): defer — ${why}\n\nAudit: ${title}`);
  deferred += 1;
  consecutive += 1;
  logLine(`  DEFERRED (${why})`);
  if (consecutive >= MAX_DEFERRALS) halt(`${MAX_DEFERRALS} consecutive deferrals`);
}

// ---- preflight --------------------------------------------------------------
for (const bin of ['gh', 'claude']) {
  if (!hasCommand(bin)) halt(`missing dependency: ${bin}`);
}
if (!gitOk('diff', '--quiet') || !gitOk('diff', '--cached', '--quiet'))
  halt('working tree is dirty');
if (!gitOk('rev-parse', '--verify', BRANCH)) git('switch', '-c', BRANCH);
git('switch', BRANCH);
if (gitOut('rev-parse', '--abbrev-ref', 'HEAD') !== BRANCH) halt(`could not switch to ${BRANCH}`);
if (!shellOk(CHECK_CMD)) halt('tree is already red before we start');

const prNumberFile = join(WORK, 'pr-number');
let prNumber = existsSync(prNumberFile) ? readFileSync(prNumberFile, 'utf8').trim() : '';
let done = 0;
let sincePush = 0;
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
    deleteFirstEntry();
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
    done += 1;
    sincePush += 1;
    consecutive = 0;
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
  let impl = await claudeStep(`${tag}.impl`, [
    'Implement the fix described in .audit-work/current-brief.md.',
    '--append-system-prompt-file',
    join(PROMPTS, 'implementer.md'),
    '--model',
    MODEL_IMPL,
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

  // The session_id is the resume handle. Addressing by session ID rather than
  // by agent name is what makes hundreds of iterations safe.
  const implSession = impl.env.session_id ?? '';
  let sha = structured(impl.env).sha ?? '';

  if (!impl.ok || structured(impl.env).success !== true || !sha) {
    logLine(`  implementer failed — restoring ${baseSha}`);
    git('reset', '-q', '--hard', baseSha);
    defer(title, 'implementation failed');
    continue;
  }

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
  for (let round = 1; round <= 3; round++) {
    const review = await claudeStep(`${tag}.review${round}`, [
      `Adversarially review commit ${sha}.\n\nThe original finding this fix must resolve:\n${issue}\n\nAcceptance criteria the verifier derived from it (which may themselves be mis-scoped):\n${acceptance}`,
      '--append-system-prompt-file',
      join(PROMPTS, 'reviewer.md'),
      '--model',
      MODEL_REVIEW,
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
    if (!review.ok) {
      status = 'CHANGES_REQUIRED';
      break;
    }
    status = structured(review.env).status ?? 'CHANGES_REQUIRED';
    if (status === 'APPROVED' || round === 3) break;

    const feedback = (structured(review.env).findings ?? []).map((f) => `- ${f}`).join('\n');
    logLine(`  round ${round}: changes required`);

    // Resume the SAME implementer session: it retains its full history —
    // every prior tool call, result, and reasoning step — so it fixes its own
    // work instead of re-deriving the change from the review text.
    impl = await claudeStep(`${tag}.fix${round}`, [
      `A reviewer raised the following on commit ${sha}. Address every point, re-run the acceptance commands, and commit.\n\n${feedback}`,
      '--resume',
      implSession,
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
      break;
    }
    const newSha = structured(impl.env).sha ?? '';
    if (!newSha) {
      status = 'CHANGES_REQUIRED';
      break;
    }
    sha = newSha;
  }

  // ---- 6. CLOSE OUT ---------------------------------------------------------
  if (status !== 'APPROVED') {
    logLine(`  unresolved after 2 fix rounds — rolling back to ${baseSha}`);
    git('reset', '-q', '--hard', baseSha);
    defer(title, 'failed adversarial review');
    continue;
  }

  // Independent fast-test gate. CHECK_CMD (and the roles) only type-check plus
  // run the finding's own acceptance commands, so a fix that type-checks but
  // breaks an unrelated unit test would otherwise commit green unattended —
  // the main silent-defect path over a long run. Catch it here and defer the
  // finding instead of letting a red commit onto the branch.
  if (!shellOk(TEST_CMD)) {
    logLine(`  ${TEST_CMD} red after review — rolling back to ${baseSha}`);
    git('reset', '-q', '--hard', baseSha);
    defer(title, 'fix broke the test suite');
    continue;
  }

  // Targeted E2E gate — only for findings the verifier flagged as touching a
  // runtime surface. Catches a behavioural regression before it commits,
  // attributed to this one finding, without paying full-suite E2E per finding.
  // The full npm test (with all E2E) still runs once per batch before push.
  if (e2eSpecs.length && !shellOk(`${E2E_CMD} ${e2eSpecs.join(' ')}`)) {
    logLine(`  targeted E2E red (${e2eSpecs.join(' ')}) — rolling back to ${baseSha}`);
    git('reset', '-q', '--hard', baseSha);
    defer(title, 'fix broke a targeted E2E spec');
    continue;
  }

  // Fold the AUDIT.md deletion into the final commit so the file is always an
  // exact record of what remains and a crash leaves nothing to reconcile.
  deleteFirstEntry();
  git('add', 'docs/AUDIT.md');
  git('commit', '-q', '--amend', '--no-edit');
  sha = gitOut('rev-parse', 'HEAD');

  if (!shellOk(CHECK_CMD)) halt(`tree went red after ${tag} (${sha})`);

  logLine(`  DONE  ${sha.slice(0, 12)}`);
  appendFileSync(join(WORK, 'completed.log'), `${sha}  ${title}\n`);
  done += 1;
  sincePush += 1;
  consecutive = 0;

  // ---- 7. PUSH, batched -----------------------------------------------------
  if (sincePush >= PUSH_EVERY) {
    // Full suite once per batch (E2E + asset-gen the per-finding TEST_CMD skips
    // for speed). Never push a red batch: hold the commits locally and retry at
    // the next boundary — a transient/flaky E2E clears on the retry, and a real
    // regression is caught in the morning via audit:status rather than shipped.
    if (!shellOk(PUSH_TEST_CMD)) {
      logLine(`  ${PUSH_TEST_CMD} red at batch boundary — holding push, will retry next batch`);
    } else if (gitOk('push', '-u', 'origin', BRANCH)) {
      if (!prNumber) {
        const created = runCmd('gh', [
          'pr',
          'create',
          '--draft',
          '--title',
          'Audit burndown',
          '--body',
          'Automated burndown of docs/AUDIT.md. In progress.',
        ]);
        prNumber = (created.stdout ?? '').trim().match(/(\d+)$/)?.[1] ?? '';
        if (prNumber) writeFileSync(prNumberFile, prNumber);
      }
      if (prNumber) {
        const recent = readFileSync(join(WORK, 'completed.log'), 'utf8')
          .trim()
          .split('\n')
          .slice(-sincePush)
          .join('\n');
        runCmd('gh', [
          'pr',
          'comment',
          prNumber,
          '--body',
          `Batch complete — ${done} done, ${deferred} deferred, ${remaining} remaining.\n\n\`\`\`\n${recent}\n\`\`\``,
        ]);
      }
      sincePush = 0;
    } else {
      logLine('  push failed — continuing, will retry next batch');
    }
  }
}

// ---- finish -----------------------------------------------------------------
// Flush the trailing sub-batch under the same full-suite gate as the batched
// pushes, so a red tail never escapes on exit either — held commits stay local
// for the operator to inspect.
if (sincePush > 0) {
  if (!shellOk(PUSH_TEST_CMD)) {
    logLine(`  ${PUSH_TEST_CMD} red on the final batch — commits held locally, not pushed`);
  } else {
    git('push', '-u', 'origin', BRANCH);
  }
}
logLine(`finished: ${done} done, ${deferred} deferred, ${countEntries()} remaining`);
