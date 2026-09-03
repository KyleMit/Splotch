import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ledgerKey,
  ledgerPath,
  planRound,
  readLedgerRecord,
  recordRound,
  removeLedgerRecord,
} from './ledger.mjs';
import { readPullRequest } from './post-review.mjs';
import { buildRivalPrompt, readPromptFile } from './prompt.mjs';
import {
  createSessionDirectory,
  SESSION_FILES,
  sessionPath,
  spoolActivityAt,
  writeJsonAtomic,
} from './spool.mjs';
import { runStreaming, STREAM_FAILURE } from './stream.mjs';
import { parseFindings } from './validate-findings.mjs';
import {
  createDisposableWorktree,
  git,
  removeDisposableWorktree,
  resolveScope,
  writeReviewPacket,
} from './worktree.mjs';

const EFFORTS = new Set(['low', 'medium', 'high']);
const DEFAULT_BASE_REF = 'main';
const USAGE =
  'usage: launch [--pr <n> | --base <ref> | --commit <sha> | --uncommitted] [--question-file <path>] [--prompt-file <path>] [--cwd <dir>] [--model <slug>] [--effort low|medium|high] [--fresh] | --end-session [--pr <n> | ...]';

// The one argument vocabulary both launchers share; a vendor validates `model` itself because the
// two CLIs name models differently.
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

const defaultResolveCommit = (repoRoot, ref) => git(repoRoot, ['rev-parse', `${ref}^{commit}`]);

// A commit scope is keyed by its full OID, never by the ref as typed: `HEAD` names a different
// commit tomorrow, and a short hash typed one way and a full hash typed another must still find
// the same reviewer. The rival's vendor is part of the key because a Codex thread id and a Claude
// session id are not interchangeable — the first Claude smoke tried to resume a Codex thread.
export function ledgerKeyFor({
  repoRoot,
  rival,
  scope,
  branch,
  resolveCommit = defaultResolveCommit,
}) {
  const kindPrefix = `${rival}:`;
  if (scope.kind === 'pr') {
    return ledgerKey({ repoRoot, kind: `${kindPrefix}pr`, ref: String(scope.number) });
  }
  if (scope.kind === 'commit') {
    return ledgerKey({
      repoRoot,
      kind: `${kindPrefix}commit`,
      ref: resolveCommit(repoRoot, scope.commit),
    });
  }
  return ledgerKey({ repoRoot, kind: `${kindPrefix}branch`, ref: branch });
}

export function logPathForAttempt(session, attempt) {
  return sessionPath(session, attempt === 1 ? SESSION_FILES.log : SESSION_FILES.retryLog);
}

// The rival gets a TMPDIR of its own inside the session: a workspace-write sandbox writes anywhere
// under the process's TMPDIR, and the handler's TMPDIR is where every session's spool lives.
// `/tmp` itself stays writable to Codex's sandbox, which matters on a Linux host whose os.tmpdir()
// is `/tmp`; NOTES.md records that as an accepted exposure.
export function rivalEnvironment(env, { session }) {
  const tmp = sessionPath(session, SESSION_FILES.tmp);
  // dprint compiles its plugin cache under ~/Library/Caches, which the sandbox refuses (the first
  // sandboxed round's `format:check` exited 12 there); its cache directory is pointed inside too.
  return { ...env, TMPDIR: tmp, DPRINT_CACHE_DIR: join(tmp, 'dprint-cache') };
}

// Only the rival refusing the run is worth a second attempt; every other failure is either the
// user's decision or a condition a retry would repeat.
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

// A vendor adapter supplies what differs between the two rivals: `rival`, `command`, `prepare()`
// (the billing guard; returns the child env), `resolveModel(requested)`, `buildArgs(...)`,
// `reducer`, `toolBoundary` (what the rival's own sandboxed shell can and cannot do, in the
// vendor's words), `newSessionId()` (a wrapper-issued id for CLIs that take one up front), and
// `endSession(record)`. Everything else in a round is the same on both sides.
export async function launch(
  options,
  vendor,
  { onProgress = (line) => process.stderr.write(`${line}\n`) } = {}
) {
  const { env, notes = [] } = vendor.prepare();
  const repoRoot = resolveRepoRoot(options.cwd);
  const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const recordPath = ledgerPath(
    ledgerKeyFor({ repoRoot, rival: vendor.rival, scope: options.scope, branch })
  );

  if (options.endSession) {
    const record = readLedgerRecord(recordPath);
    if (record) vendor.endSession?.(record);
    removeLedgerRecord(recordPath);
    return { endedSession: record?.rivalSessionId ?? null };
  }

  const model = vendor.resolveModel(options.model);
  const question = options.questionFile ? readPromptFile(options.questionFile) : undefined;
  const extraInstructions = options.promptFile ? readPromptFile(options.promptFile) : undefined;
  // A question is one turn, not a review that a later round would verify.
  let plan = question
    ? planRound(undefined)
    : planRound(readLedgerRecord(recordPath), { fresh: options.fresh, rival: vendor.rival });

  const scope = resolveLaunchScope(repoRoot, options.scope);
  scope.range = `${scope.base}...${scope.head}`;
  const id = randomUUID();
  const session = createSessionDirectory(id);
  const worktree = join(session, 'worktree');
  const packetDir = sessionPath(session, SESSION_FILES.packet);
  onProgress(`session: ${session}`);
  for (const note of notes) onProgress(note);

  // session.json lands before provisioning so a failure there is still observable through
  // `broker next` rather than as "no session".
  const writeSessionRecord = () =>
    writeJsonAtomic(sessionPath(session, SESSION_FILES.session), {
      id,
      rival: vendor.rival,
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
  writeSessionRecord();
  let attempt = 0;
  let rivalSession;

  try {
    createDisposableWorktree(repoRoot, scope.head, worktree);
    writeReviewPacket(repoRoot, scope, packetDir);
    const runRound = async () => {
      attempt += 1;
      writeSessionRecord();
      rivalSession = plan.resume
        ? { mode: 'resume', id: plan.resume }
        : { mode: 'create', id: vendor.newSessionId?.() };
      if (plan.resume) onProgress(`resuming reviewer ${plan.resume} for round ${plan.round}`);
      const logPath = logPathForAttempt(session, attempt);
      onProgress(`stream log: ${logPath}`);
      const prompt = buildRivalPrompt({
        scope,
        question,
        worktree,
        packetDir,
        round: plan.round,
        previous: plan.previous,
        landedCommits: describeLandedCommits(repoRoot, plan.previous, scope.head),
        extraInstructions,
        toolBoundary: vendor.toolBoundary,
      });
      return runStreaming({
        command: vendor.command,
        args: vendor.buildArgs({
          worktree,
          session,
          packetDir,
          model,
          effort: options.effort,
          rivalSession,
        }),
        cwd: worktree,
        env: rivalEnvironment(env, { session }),
        stdin: prompt,
        logPath,
        onProgress,
        reducer: vendor.reducer,
        activityProbe: () => spoolActivityAt(session),
      });
    };

    let state;
    try {
      state = await runRound();
    } catch (error) {
      // The rival's own session store can prune a recorded conversation — that is worth one fresh
      // attempt. A cancelled run, a stalled run, and a lost audit log are not.
      if (!plan.resume || !isRetryableResumeFailure(error)) throw error;
      onProgress(`resume failed (${error.message.split('\n')[0]}); starting fresh`);
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
        rivalSessionId: state.sessionId ?? rivalSession.id,
        base: scope.base,
        head: scope.head,
        rival: vendor.rival,
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

export function runLaunchCli(argv, vendor) {
  return launch(parseLaunchArgs(argv), vendor)
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
