#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertSubscriptionBilling,
  CONFIG_PATH,
  SUBSCRIPTION_BASE_URL,
  SUBSCRIPTION_CREDENTIALS_STORE,
  SUBSCRIPTION_MODEL_PROVIDER,
} from './codex-subscription-auth.mjs';
import { isEntryPoint } from '../../../../tools/rival-agent/broker-server.mjs';
import {
  ledgerKey,
  ledgerPath,
  planRound,
  readLedgerRecord,
  recordRound,
  removeLedgerRecord,
} from '../../../../tools/rival-agent/ledger.mjs';
import { buildRivalPrompt, readPromptFile } from '../../../../tools/rival-agent/prompt.mjs';
import { readPullRequest } from '../../../../tools/rival-agent/post-review.mjs';
import {
  createSessionDirectory,
  PENDING_REQUEST_TIMEOUT_MS,
  SESSION_FILES,
  sessionPath,
  spoolActivityAt,
  writeJsonAtomic,
} from '../../../../tools/rival-agent/spool.mjs';
import {
  codexReducer,
  runStreaming,
  STREAM_FAILURE,
} from '../../../../tools/rival-agent/stream.mjs';
import {
  FINDINGS_SCHEMA_PATH,
  parseFindings,
} from '../../../../tools/rival-agent/validate-findings.mjs';
import {
  createDisposableWorktree,
  git,
  removeDisposableWorktree,
  resolveScope,
  writeReviewPacket,
} from '../../../../tools/rival-agent/worktree.mjs';

const CORE_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../tools/rival-agent'
);
export const BROKER_SERVER_PATH = join(CORE_DIRECTORY, 'broker-server.mjs');
export const RIVAL = 'codex';
// Ambient tool surfaces that bypass the sandbox. `apps` is the one that matters most: it is a
// built-in MCP server exposing GitHub read *and write* tools, and it is how a review of this very
// skill once posted a review to its own pull request while claiming it could not reach GitHub.
export const ISOLATION_FEATURES = Object.freeze([
  'apps',
  'hooks',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'multi_agent',
  'image_generation',
]);
const EFFORTS = new Set(['low', 'medium', 'high']);
const DEFAULT_BASE_REF = 'main';
// Codex model slugs are free-form and change between releases, so the launcher validates only
// that the value cannot be mistaken for a flag rather than pinning a set that would go stale.
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TOP_LEVEL_MODEL = /^[ \t]*model[ \t]*=[ \t]*["']([^"']*)["']/m;
const FIRST_TABLE_HEADER = /^[ \t]*\[/m;
const USAGE =
  'usage: launch-codex.mjs [--pr <n> | --base <ref> | --commit <sha> | --uncommitted] [--question-file <path>] [--prompt-file <path>] [--cwd <dir>] [--model <slug>] [--effort low|medium|high] [--fresh] | --end-session [--pr <n> | ...]';

export function parseLaunchArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      pr: { type: 'string' },
      base: { type: 'string' },
      commit: { type: 'string' },
      uncommitted: { type: 'boolean', default: false },
      'question-file': { type: 'string' },
      'prompt-file': { type: 'string' },
      cwd: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      fresh: { type: 'boolean', default: false },
      'end-session': { type: 'boolean', default: false },
    },
  });
  if (positionals.length > 0) throw new Error(USAGE);
  const scopes = [
    values.pr !== undefined && 'pr',
    values.base !== undefined && 'base',
    values.commit !== undefined && 'commit',
    values.uncommitted && 'uncommitted',
  ].filter(Boolean);
  if (scopes.length > 1) throw new Error(`scopes are mutually exclusive: ${scopes.join(', ')}`);
  if (values.pr !== undefined && !/^\d+$/.test(values.pr)) throw new Error('--pr must be a number');
  const effort = values.effort ?? 'high';
  if (!EFFORTS.has(effort)) throw new Error(`unsupported effort: ${effort}`);
  if (values.model !== undefined && !MODEL_PATTERN.test(values.model)) {
    throw new Error(`unsupported model: ${values.model}`);
  }
  const kind = scopes[0] ?? 'base';
  return {
    scope: {
      kind,
      base: kind === 'base' ? (values.base ?? DEFAULT_BASE_REF) : undefined,
      commit: values.commit,
      number: values.pr === undefined ? undefined : Number(values.pr),
    },
    questionFile: values['question-file'],
    promptFile: values['prompt-file'],
    cwd: values.cwd ?? process.cwd(),
    model: values.model,
    effort,
    fresh: values.fresh,
    endSession: values['end-session'],
  };
}

// `--ignore-user-config` is what keeps the user's MCP servers off the rival, and it drops the
// configured model with them; reading that one key back keeps the documented default.
export function readConfiguredModel(configToml) {
  const preamble = configToml.split(FIRST_TABLE_HEADER)[0];
  return TOP_LEVEL_MODEL.exec(preamble)?.[1];
}

// Inline TOML for the one server the rival may see. JSON string escaping is valid TOML basic-string
// escaping for every character a path or session id can contain.
export function brokerServerToml({ session, brokerServerPath, nodePath, toolTimeoutSeconds }) {
  const string = (value) => JSON.stringify(String(value));
  return `mcp_servers={broker={command=${string(nodePath)},args=[${string(brokerServerPath)}],env={RIVAL_SESSION_DIR=${string(session)}},default_tools_approval_mode="approve",tool_timeout_sec=${toolTimeoutSeconds}}}`;
}

export function buildCodexArgs({
  worktree,
  session,
  brokerServerPath = BROKER_SERVER_PATH,
  nodePath = process.execPath,
  schemaPath = FINDINGS_SCHEMA_PATH,
  model,
  effort,
  resumeThreadId,
  toolTimeoutSeconds = PENDING_REQUEST_TIMEOUT_MS / 1000,
}) {
  const shared = [
    '--json',
    // A -c override of mcp_servers merges into the configured table instead of replacing it, so the
    // only way to leave the user's servers behind is to leave the whole config behind; auth still
    // resolves from CODEX_HOME.
    '--ignore-user-config',
    '-C',
    worktree,
    ...ISOLATION_FEATURES.flatMap((feature) => ['--disable', feature]),
    '-c',
    'sandbox_mode="read-only"',
    // sandbox_mode alone is not read-only: with an on-request approval policy Codex escalates out
    // of the sandbox, and a configured auto-reviewer approves it without a human ever seeing the
    // request. Verified — read-only alone created a file; this pin denies it.
    '-c',
    'approval_policy="never"',
    // MCP tool calls are auto-rejected under approval_policy="never" unless the server itself is
    // marked approved; the broker is the one door the design opens.
    '-c',
    brokerServerToml({ session, brokerServerPath, nodePath, toolTimeoutSeconds }),
    '-c',
    `model_provider="${SUBSCRIPTION_MODEL_PROVIDER}"`,
    '-c',
    `cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`,
    '-c',
    `openai_base_url="${SUBSCRIPTION_BASE_URL}"`,
    '-m',
    model,
    '-c',
    `model_reasoning_effort="${effort}"`,
    '--output-schema',
    schemaPath,
  ];
  if (resumeThreadId) return ['exec', 'resume', ...shared, resumeThreadId, '-'];
  return ['exec', ...shared, '-'];
}

const defaultResolveCommit = (repoRoot, ref) => git(repoRoot, ['rev-parse', `${ref}^{commit}`]);

// A commit scope is keyed by its full OID, never by the ref as typed: `HEAD` names a different
// commit tomorrow, and a short hash typed one way and a full hash typed another must still find
// the same reviewer.
export function ledgerKeyFor({ repoRoot, scope, branch, resolveCommit = defaultResolveCommit }) {
  if (scope.kind === 'pr') return ledgerKey({ repoRoot, kind: 'pr', ref: String(scope.number) });
  if (scope.kind === 'commit') {
    return ledgerKey({ repoRoot, kind: 'commit', ref: resolveCommit(repoRoot, scope.commit) });
  }
  return ledgerKey({ repoRoot, kind: 'branch', ref: branch });
}

export function logPathForAttempt(session, attempt) {
  return sessionPath(session, attempt === 1 ? SESSION_FILES.log : SESSION_FILES.retryLog);
}

// Only Codex refusing the run is worth a second attempt; every other failure is either the user's
// decision or a condition a retry would repeat.
export function isRetryableResumeFailure(error) {
  return error?.code === STREAM_FAILURE.exited;
}

function resolveRepoRoot(cwd) {
  const root = git(resolve(cwd), ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (!root) throw new Error(`--cwd must name a directory inside a git worktree: ${cwd}`);
  return root;
}

function resolveLaunchScope(repoRoot, scope) {
  if (scope.kind !== 'pr') return resolveScope(repoRoot, scope);
  const metadata = readPullRequest(scope.number);
  git(repoRoot, ['fetch', '--no-tags', 'origin', metadata.baseRefOid, metadata.headRefOid]);
  return resolveScope(repoRoot, { ...scope, ...metadata });
}

function describeLandedCommits(repoRoot, previous, head) {
  if (!previous) return undefined;
  return git(repoRoot, ['log', '--oneline', '--no-decorate', `${previous.lastHead}..${head}`], {
    allowFailure: true,
  });
}

function runCodex(args, { worktree, env, prompt, session, attempt }) {
  const logPath = logPathForAttempt(session, attempt);
  process.stderr.write(`stream log: ${logPath}\n`);
  return runStreaming({
    command: 'codex',
    args,
    cwd: worktree,
    env,
    stdin: prompt,
    logPath,
    onProgress: (line) => process.stderr.write(`${line}\n`),
    reducer: codexReducer,
    activityProbe: () => spoolActivityAt(session),
  });
}

function finish(session, state, logPath, extra) {
  const parsed = parseFindings(state.message ?? '');
  writeFileSync(sessionPath(session, SESSION_FILES.rawResult), `${state.message ?? ''}\n`);
  if (!parsed.ok) {
    writeJsonAtomic(sessionPath(session, SESSION_FILES.failed), {
      reason: `the rival's final message is not a findings document: ${parsed.errors.join('; ')}`,
      rawResultPath: sessionPath(session, SESSION_FILES.rawResult),
      logPath,
      ...extra,
    });
    throw new Error(`findings did not validate: ${parsed.errors.join('; ')}`);
  }
  const findingsPath = sessionPath(session, SESSION_FILES.findings);
  writeJsonAtomic(findingsPath, parsed.findings);
  const done = {
    findingsPath,
    findings: parsed.findings.findings.length,
    unverified: parsed.findings.unverified.length,
    rivalSessionId: state.sessionId,
    usage: state.usage,
    logPath,
    ...extra,
  };
  writeJsonAtomic(sessionPath(session, SESSION_FILES.done), done);
  return done;
}

export async function launch(options) {
  const { env, stripped } = assertSubscriptionBilling();
  const repoRoot = resolveRepoRoot(options.cwd);
  const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const key = ledgerKeyFor({ repoRoot, scope: options.scope, branch });
  const recordPath = ledgerPath(key);

  if (options.endSession) {
    removeLedgerRecord(recordPath);
    return { endedSession: key };
  }

  const model =
    options.model ??
    readConfiguredModel(existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, 'utf8') : '');
  if (!model)
    throw new Error('no model: pass --model or set a top-level model in ~/.codex/config.toml');
  const question = options.questionFile ? readPromptFile(options.questionFile) : undefined;
  const extraInstructions = options.promptFile ? readPromptFile(options.promptFile) : undefined;
  // A question is one turn, not a review that a later round would verify.
  let plan = question
    ? planRound(undefined)
    : planRound(readLedgerRecord(recordPath), { fresh: options.fresh });

  const scope = resolveLaunchScope(repoRoot, options.scope);
  scope.range = `${scope.base}...${scope.head}`;
  const id = randomUUID();
  const session = createSessionDirectory(id);
  const worktree = join(session, 'worktree');
  const packetDir = sessionPath(session, SESSION_FILES.packet);
  process.stderr.write(`session: ${session}\n`);
  if (stripped.length > 0) {
    process.stderr.write(`ignoring API-billing environment: ${stripped.join(', ')}\n`);
  }

  try {
    createDisposableWorktree(repoRoot, scope.head, worktree);
    writeReviewPacket(repoRoot, scope, packetDir);
    let attempt = 0;
    const runRound = async () => {
      attempt += 1;
      writeJsonAtomic(sessionPath(session, SESSION_FILES.session), {
        id,
        rival: RIVAL,
        scope,
        question: Boolean(question),
        worktree,
        packetDir,
        round: plan.round,
        resumed: Boolean(plan.resume),
        repoRoot,
        branch,
        createdAt: new Date().toISOString(),
      });
      if (plan.resume)
        process.stderr.write(`resuming reviewer ${plan.resume} for round ${plan.round}\n`);
      const prompt = buildRivalPrompt({
        scope,
        question,
        worktree,
        packetDir,
        round: plan.round,
        previous: plan.previous,
        landedCommits: describeLandedCommits(repoRoot, plan.previous, scope.head),
        extraInstructions,
      });
      const args = buildCodexArgs({
        worktree,
        session,
        model,
        effort: options.effort,
        resumeThreadId: plan.resume,
      });
      return runCodex(args, { worktree, env, prompt, session, attempt });
    };

    let state;
    try {
      state = await runRound();
    } catch (error) {
      // Codex prunes its own session store, so a recorded thread can simply be gone — that is
      // worth one fresh attempt. A cancelled run, a stalled run, and a lost audit log are not.
      if (!plan.resume || !isRetryableResumeFailure(error)) throw error;
      process.stderr.write(`resume failed (${error.message.split('\n')[0]}); starting fresh\n`);
      removeLedgerRecord(recordPath);
      plan = planRound(undefined);
      state = await runRound();
    }
    const done = finish(session, state, logPathForAttempt(session, attempt), {
      session,
      round: plan.round,
      scope,
    });
    if (!question) {
      recordRound(recordPath, {
        record: plan.previous,
        rivalSessionId: state.sessionId,
        base: scope.base,
        head: scope.head,
        rival: RIVAL,
      });
    }
    return done;
  } catch (error) {
    if (!existsSync(sessionPath(session, SESSION_FILES.failed))) {
      writeJsonAtomic(sessionPath(session, SESSION_FILES.failed), {
        reason: error.message,
        code: error.code,
        session,
        logPath: logPathForAttempt(session, Math.max(attempt, 1)),
      });
    }
    throw error;
  } finally {
    removeDisposableWorktree(repoRoot, worktree);
  }
}

if (isEntryPoint(import.meta.url)) {
  launch(parseLaunchArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
