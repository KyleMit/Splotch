#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  assertSubscriptionBilling,
  SUBSCRIPTION_BASE_URL,
  SUBSCRIPTION_CREDENTIALS_STORE,
  SUBSCRIPTION_MODEL_PROVIDER,
} from './codex-subscription-auth.mjs';
import { runCodexStreaming } from './codex-stream.mjs';
import {
  readSessionRecord,
  removeSessionRecord,
  sessionKey,
  sessionRecordPath,
  writeSessionRecord,
} from './codex-session.mjs';

const PROFILES = new Set(['review', 'ask']);
// Ambient tool surfaces that bypass the sandbox. `apps` is the one that matters most: it is a
// built-in MCP server exposing GitHub read *and write* tools, and it is how a review of this very
// skill posted a review to its own pull request while claiming it could not reach GitHub.
export const ISOLATION_FEATURES = Object.freeze([
  'apps',
  'hooks',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
]);
const EFFORTS = new Set(['low', 'medium', 'high']);
const DEFAULT_BASE_REF = 'main';
const MAX_PROMPT_BYTES = 256 * 1024;
// Codex model slugs are free-form and change between releases, so the runner validates only that
// the value cannot be mistaken for a flag rather than pinning a set that would go stale.
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const USAGE =
  'usage: codex-run.mjs [--profile review|ask] [--base <ref> | --uncommitted | --commit <sha>] [--prompt-file <path>] [--cwd <dir>] [--model <slug>] [--effort low|medium|high]';

export function parseRunArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      profile: { type: 'string' },
      base: { type: 'string' },
      uncommitted: { type: 'boolean', default: false },
      commit: { type: 'string' },
      'prompt-file': { type: 'string' },
      fresh: { type: 'boolean', default: false },
      'end-session': { type: 'boolean', default: false },
      cwd: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
    },
  });
  if (positionals.length > 0) throw new Error(USAGE);
  if (values['end-session']) return { endSession: true };
  const profile = values.profile ?? 'review';
  if (!PROFILES.has(profile)) throw new Error(`unsupported profile: ${profile}`);
  const effort = values.effort ?? 'high';
  if (!EFFORTS.has(effort)) throw new Error(`unsupported effort: ${effort}`);
  if (values.model !== undefined && !MODEL_PATTERN.test(values.model)) {
    throw new Error(`unsupported model: ${values.model}`);
  }
  const scopes = [
    values.base !== undefined && 'base',
    values.uncommitted && 'uncommitted',
    values.commit !== undefined && 'commit',
  ].filter(Boolean);
  if (scopes.length > 1)
    throw new Error(`review scopes are mutually exclusive: ${scopes.join(', ')}`);
  if (profile === 'ask') {
    if (scopes.length > 0)
      throw new Error(`--${scopes[0]} is available only with --profile review`);
    if (!values['prompt-file']) throw new Error('--profile ask requires --prompt-file');
  }
  return {
    profile,
    scope: profile === 'review' ? (scopes[0] ?? 'base') : undefined,
    base: values.base ?? DEFAULT_BASE_REF,
    commit: values.commit,
    promptFile: values['prompt-file'],
    cwd: values.cwd ?? process.cwd(),
    model: values.model,
    effort,
    fresh: values.fresh,
  };
}

export function readPromptFile(path) {
  if (!isAbsolute(path)) throw new Error('--prompt-file must be absolute');
  const stats = statSync(path);
  if (!stats.isFile()) throw new Error('--prompt-file must name a regular file');
  // Sized before reading so an enormous file is refused rather than decoded into memory first; the
  // post-read check still catches a file that grew between the two.
  if (stats.size > MAX_PROMPT_BYTES)
    throw new Error(`--prompt-file exceeds ${MAX_PROMPT_BYTES} bytes`);
  const prompt = readFileSync(path, 'utf8');
  if (Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) {
    throw new Error(`--prompt-file exceeds ${MAX_PROMPT_BYTES} bytes`);
  }
  if (!prompt.trim()) throw new Error('--prompt-file is empty');
  return prompt;
}

export function resolveWorktree(cwd, runGit = defaultRunGit) {
  const root = runGit(resolve(cwd));
  if (!root) throw new Error(`--cwd must name a directory inside a git worktree: ${cwd}`);
  return root;
}

function defaultRunGit(cwd) {
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

export function buildCodexArgs(options) {
  // Read-only is the point of an independent review: Codex reads the tree and reports, and can
  // never edit the work it is reviewing. `review` takes no --sandbox flag, so both profiles set it
  // through the same config override.
  // A project-level .codex/config.toml inside the reviewed worktree can retarget model_provider at
  // higher precedence than the login guard inspects, so the subscription provider is pinned here
  // rather than only validated in $CODEX_HOME.
  const shared = [
    '--json',
    ...ISOLATION_FEATURES.flatMap((feature) => ['--disable', feature]),
    '-c',
    'sandbox_mode="read-only"',
    // sandbox_mode alone is not read-only: with an on-request approval policy Codex escalates out
    // of the sandbox, and a configured auto-reviewer approves it without a human ever seeing the
    // request. Verified — read-only alone created a file; this pin denies it.
    '-c',
    'approval_policy="never"',
    // Configured MCP servers run outside the sandbox entirely, so a review would otherwise inherit
    // whatever write-capable tools the user's config happens to expose.
    '-c',
    'mcp_servers={}',
    '-c',
    `model_provider="${SUBSCRIPTION_MODEL_PROVIDER}"`,
    '-c',
    `cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`,
    '-c',
    `openai_base_url="${SUBSCRIPTION_BASE_URL}"`,
  ];
  if (options.model) shared.push('-m', options.model);
  shared.push('-c', `model_reasoning_effort="${options.effort}"`);
  if (options.profile === 'ask') return ['exec', ...shared];
  // Resuming is not `review`: the subcommand has no resume form, so a later round runs a plain
  // exec turn carrying the earlier review's conversation, and states its own scope in the prompt.
  if (options.resumeThreadId) {
    return ['exec', 'resume', ...shared, options.resumeThreadId, '-'];
  }
  // `codex exec review` refuses a scope flag and a custom PROMPT together, so focus instructions
  // and a built-in scope are alternatives: with instructions the scope moves into the prompt text
  // (see describeScope), without them the flag drives Codex's own review harness.
  if (options.hasInstructions) return ['exec', 'review', ...shared, '-'];
  // `--flag=value` rather than two arguments: a flag-shaped ref such as `--base=--uncommitted`
  // would otherwise reach Codex as a separate option and silently change the scope.
  const scopeFlags = {
    base: [`--base=${options.base}`],
    uncommitted: ['--uncommitted'],
    commit: [`--commit=${options.commit}`],
  }[options.scope];
  return ['exec', 'review', ...shared, ...scopeFlags];
}

export function describeScope({ scope, base, commit }) {
  if (scope === 'uncommitted') {
    return 'Review the staged, unstaged, and untracked changes in this worktree.';
  }
  if (scope === 'commit') return `Review the changes introduced by commit ${commit}.`;
  return `Review this branch's changes against ${base} (git diff ${base}...HEAD).`;
}

// Stated in every prompt because the failure mode it guards against grows with each round: a
// reviewer asked again to find defects will find something whether or not anything is there.
const NO_DEFECTS_IS_AN_ANSWER =
  'Reporting no defects is a correct and expected outcome. Do not manufacture findings, and do not lower your bar to produce one.';

export function buildReviewPrompt(options, extraInstructions) {
  const preamble = `You are an independent second-opinion reviewer; you did not write this code. ${describeScope(options)} Report only defects you can point to in the diff, each anchored to a file and line, and say plainly when you find nothing. ${NO_DEFECTS_IS_AN_ANSWER}`;
  return extraInstructions ? `${preamble}\n\n${extraInstructions}` : preamble;
}

export function buildRoundPrompt(options, record, landedCommits, extraInstructions) {
  const round = record.rounds + 1;
  const sections = [
    `This is round ${round} of your review of this branch; rounds 1 through ${record.rounds} are above in this conversation.`,
    `Since your last round, these commits landed:\n${landedCommits || '(no new commits)'}`,
    `${describeScope(options)} Two jobs, in order: first check whether the findings you already reported were actually addressed, and say so for each — a fix that misses the point is worth more than a new finding. Then review what changed since your last round.`,
    `Do not re-report findings you already raised and that were fixed, and do not re-litigate ones you withdrew. ${NO_DEFECTS_IS_AN_ANSWER}`,
  ];
  if (extraInstructions) sections.push(extraInstructions);
  return sections.join('\n\n');
}

// Only the review profile carries rounds: an `ask` turn is a question, not a review that a later
// round would verify.
function resolveSession(options, cwd) {
  if (options.profile !== 'review') return undefined;
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') return undefined;
  const path = sessionRecordPath(sessionKey(cwd, branch));
  return { path, branch, record: options.fresh ? undefined : readSessionRecord(path) };
}

function reviewPrompt(options, session, cwd, extraInstructions) {
  if (options.profile !== 'review') return extraInstructions;
  if (!session?.record) return buildReviewPrompt(options, extraInstructions);
  const landed = git(cwd, ['log', '--oneline', `${session.record.head}..HEAD`]);
  return buildRoundPrompt(options, session.record, landed, extraInstructions);
}

async function runRound(options, session, { cwd, env, extraInstructions, logPath }) {
  const resumeThreadId = session?.record?.threadId;
  return runCodexStreaming({
    command: 'codex',
    args: buildCodexArgs({
      ...options,
      resumeThreadId,
      hasInstructions: extraInstructions !== undefined || Boolean(resumeThreadId),
    }),
    cwd,
    env,
    prompt: reviewPrompt(options, session, cwd, extraInstructions),
    logPath,
    onProgress: (line) => process.stderr.write(`${line}\n`),
  });
}

async function main() {
  const options = parseRunArgs(process.argv.slice(2));
  const { env, stripped } = assertSubscriptionBilling();
  const cwd = resolveWorktree(options.cwd);

  if (options.endSession) {
    const session = resolveSession({ profile: 'review', fresh: false }, cwd);
    if (session) removeSessionRecord(session.path);
    process.stdout.write(`${JSON.stringify({ endedSession: session?.branch ?? null })}\n`);
    return;
  }

  const extraInstructions = options.promptFile ? readPromptFile(options.promptFile) : undefined;
  let session = resolveSession(options, cwd);
  const logPath = join(tmpdir(), `codex-run-${randomUUID()}.jsonl`);

  process.stderr.write(`stream log: ${logPath}\n`);
  if (stripped.length > 0) {
    process.stderr.write(`ignoring API-billing environment: ${stripped.join(', ')}\n`);
  }
  if (session?.record) {
    process.stderr.write(
      `resuming reviewer ${session.record.threadId} for round ${session.record.rounds + 1}\n`
    );
  }

  let result;
  try {
    result = await runRound(options, session, { cwd, env, extraInstructions, logPath });
  } catch (error) {
    // Codex prunes its own session store, so a recorded thread can simply be gone. That is a
    // reason to start a fresh reviewer once, not to fail the round.
    if (!session?.record) throw error;
    process.stderr.write(`resume failed (${error.message.split('\n')[0]}); starting fresh\n`);
    removeSessionRecord(session.path);
    session = { ...session, record: undefined };
    result = await runRound(options, session, {
      cwd,
      env,
      extraInstructions,
      logPath: join(tmpdir(), `codex-run-${randomUUID()}.jsonl`),
    });
  }

  const round = (session?.record?.rounds ?? 0) + 1;
  if (session && result.threadId) {
    writeSessionRecord(session.path, {
      threadId: session.record?.threadId ?? result.threadId,
      branch: session.branch,
      rounds: round,
      head: git(cwd, ['rev-parse', 'HEAD']),
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        profile: options.profile,
        scope: options.scope,
        base: options.scope === 'base' ? options.base : undefined,
        commit: options.commit,
        cwd,
        round: session ? round : undefined,
        resumed: Boolean(session?.record),
        threadId: result.threadId,
        usage: result.usage,
        logPath,
        message: result.message,
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
