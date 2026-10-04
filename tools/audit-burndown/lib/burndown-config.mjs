// The burndown's env knobs, resolved and validated in one place. The driver
// builds its run from readConfig and preflight calls the same function, so a
// value the run would refuse fails preflight before an unattended launch.

import { join } from 'node:path';
import { NON_NEGATIVE_INTEGER, parseNumberFlag, POSITIVE_INTEGER } from '../../lib/proc.mjs';
import { agentRunnerDefaults, normalizeAgentRunner } from './agent-runner.mjs';
import { auditFile, DEFAULT_MAX_ISSUES, launchCommand, WORK } from './burndown-core.mjs';

// Per-commit PR comment records: one line appended the moment its fix lands, for
// the supervising agent to render and post through the GitHub MCP tools. It
// deliberately lives OUTSIDE git — a tracked file would be caught by the
// rollback paths' `git reset --hard`, which is precisely how pending records
// would get destroyed. Point it at a committed path (and drain + delete that
// file at closeout) when a run will go unwatched long enough that losing the
// container would matter.
//
// Status and the comment drain resolve the store here rather than through
// readConfig, so a malformed knob they never use cannot stop them.
export const commentStorePath = (env = process.env) =>
  env.COMMENT_STORE ?? join(WORK, 'pending-comments.jsonl');

// An environment variable, not a flag, so a rejection names the variable instead of
// parseNumberFlag's `--name` wording. Unset keeps the default; any set value must parse.
function readIntegerKnob(env, name, fallback, rule) {
  const raw = env[name];
  if (raw === undefined) return fallback;
  try {
    return parseNumberFlag(name, raw, rule);
  } catch {
    throw new Error(`${name} must be an integer >= ${rule.min}; received ${JSON.stringify(raw)}`);
  }
}

// Every env knob a run reads, resolved once. `env` is a parameter so a test can
// construct a run under a specific set of knobs without mutating the process
// environment; production always passes its own.
export function readConfig(env = process.env) {
  // The runner-specific skills set this explicitly. Claude remains the default
  // for backward compatibility with existing launch commands.
  const AGENT_RUNNER = normalizeAgentRunner(env.AGENT_RUNNER);
  const RUNNER_DEFAULTS = agentRunnerDefaults(AGENT_RUNNER);
  const MAX_ISSUES = readIntegerKnob(env, 'MAX_ISSUES', DEFAULT_MAX_ISSUES, POSITIVE_INTEGER);

  return {
    MAX_ISSUES,
    // The backlog the whole run pops from, deletes from, and counts. Resolved
    // here rather than read per-call from the ambient environment so it cannot
    // disagree with the AUDIT_FILE the recorded launch command names — a run
    // that relabels its backlog while processing another one leaves an "exact
    // relaunch" record for a run that never happened.
    AUDIT_FILE: auditFile(env),
    // The command that relaunches this exact run, resolved from the same env the
    // knobs above came from so the recorded line can never describe a different
    // run than the one in force (see recordLaunch).
    LAUNCH_COMMAND: launchCommand(env, MAX_ISSUES),
    // A supervised detached segment must stop for CI and comment reconciliation
    // after a bounded number of outcomes. Unlike MAX_ISSUES, this counts invalid
    // drops and deferrals too. Zero keeps the historical unbounded behavior.
    MAX_HANDLED: readIntegerKnob(env, 'MAX_HANDLED', 0, NON_NEGATIVE_INTEGER),
    // Push after EVERY finding. The run lives in an ephemeral cloud container that
    // is reclaimed without warning, so an unpushed commit is a commit at risk: the
    // only durable artifact is what is on origin. Batching existed to amortise a
    // full-suite gate that no longer runs here (see PUSH_TEST_CMD), which leaves
    // nothing to amortise — a push is a second, and a lost hour of model work is an
    // hour. Raise it only if you are pushing somewhere rate-limited.
    PUSH_EVERY: readIntegerKnob(env, 'PUSH_EVERY', 1, POSITIVE_INTEGER),
    BRANCH: env.BRANCH ?? 'audit/burndown',
    CHECK_CMD: env.CHECK_CMD ?? 'npm run check', // type-check gate, every finding
    TEST_CMD: env.TEST_CMD ?? 'npm run test:unit', // fast-test gate, every finding
    E2E_CMD: env.E2E_CMD ?? 'npm run test:e2e -- --retries=1', // targeted E2E (retry past transient flakes), UI-touching findings only
    // Joins the targeted E2E gate whenever the fix's range adds a static import
    // edge under web/src (see withBundleGate). Playwright's web server builds
    // first, so this pays a production build per import-adding finding — set it
    // empty to fall back to CI-only detection of bundle re-partitioning.
    BUNDLE_SPEC: env.BUNDLE_SPEC ?? 'tests/startup-bundle.spec.ts',
    LINT_CMD: env.LINT_CMD ?? 'npx eslint', // per-finding lint gate, on the fix's changed files
    // Local full-suite gate before a push — OFF by default. Every push lands on the
    // draft PR, whose CI runs the whole suite anyway, in parallel, without sitting
    // on the critical path of the next finding. Running it locally too would cost
    // ~1–2 min per finding to learn the same thing later than CI does. The tradeoff
    // is real and deliberate: cross-finding regressions the per-finding targeted
    // specs cannot see now surface in CI (asynchronously) rather than blocking the
    // push, so the supervising agent has to actually watch CI. Set it to `npm test`
    // to restore the blocking local gate.
    PUSH_TEST_CMD: env.PUSH_TEST_CMD ?? '',
    COMMENT_STORE: commentStorePath(env),
    // Consecutive deferrals before the run halts.
    MAX_DEFERRALS: readIntegerKnob(env, 'MAX_DEFERRALS', 3, POSITIVE_INTEGER),
    // Total attempts per agent step on a transient failure — N-1 retries — so 0,
    // which would run no attempt at all, is refused. Named RETRIES as an env var
    // because that knob is published in LAUNCH_KNOBS.
    RETRIES: readIntegerKnob(env, 'RETRIES', 3, POSITIVE_INTEGER),

    AGENT_RUNNER,
    RUNNER_DEFAULTS,
    MODEL_VERIFY: env.MODEL_VERIFY ?? RUNNER_DEFAULTS.verifyModel,
    MODEL_IMPL: env.MODEL_IMPL ?? RUNNER_DEFAULTS.implementModel,
    MODEL_IMPL_MINOR: env.MODEL_IMPL_MINOR ?? RUNNER_DEFAULTS.minorImplementModel,
    MODEL_REVIEW: env.MODEL_REVIEW ?? RUNNER_DEFAULTS.reviewModel,

    // Claude Code enforces these per-call dollar caps. Codex subscription-backed
    // runs have no equivalent CLI switch, so its backend ignores them.
    //
    // Impl gets the deepest budget: a multi-file extraction fix round hit the old
    // 4.00 cap with the work finished and every gate green (2026-08-05 canary,
    // $4.0036), while verify and review peaked under $1 against their $3.00 caps.
    // A cap below what the work costs saves nothing — it converts a done,
    // gate-passing fix into a deferral and pays for the finding again on the
    // re-run. Dollars are notional on a subscription; the real ceiling is the
    // usage window.
    BUDGET_VERIFY: env.BUDGET_VERIFY ?? '3.00',
    BUDGET_IMPL: env.BUDGET_IMPL ?? '7.00',
    BUDGET_REVIEW: env.BUDGET_REVIEW ?? '3.00',

    // Both backends expose reasoning effort. Verify stays medium because an INVALID
    // verdict permanently drops a finding; implementation stays high because it
    // manufactures the change; review stays medium behind deterministic gates.
    EFFORT_VERIFY: env.EFFORT_VERIFY ?? 'medium',
    EFFORT_IMPL: env.EFFORT_IMPL ?? 'high',
    EFFORT_REVIEW: env.EFFORT_REVIEW ?? 'medium',

    // A run is fully resumable from git + docs/AUDIT.md alone, so a brand-new session
    // (even a fresh container, with no .audit-work/) can pick up exactly where a
    // crashed one stopped. RESUME=1 additionally clears crash residue that would
    // otherwise block startup; the unattended launcher sets it. See "Resuming a
    // crashed run" in the burn-down-audits skill.
    RESUME: env.RESUME === '1' || env.RESUME === 'true',
  };
}
