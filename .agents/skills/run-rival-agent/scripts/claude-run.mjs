#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertNoApiBillingEnvironment } from './splotch-claude-subscription-auth.mjs';
import { runClaudeStreaming } from './splotch-claude-stream.mjs';

export const RUNNER_PATHS = {
  claude: '/Users/kylemit/.local/bin/claude',
  git: '/usr/bin/git',
  settings: '/Users/kylemit/.config/splotch-run-claude/settings.json',
  boundary: '/Users/kylemit/.config/splotch-run-claude/runner-boundary.md',
  manifest: '/Users/kylemit/.config/splotch-run-claude/manifest.json',
  subscriptionAuth: '/Users/kylemit/.local/libexec/splotch-claude-subscription-auth.mjs',
  stream: '/Users/kylemit/.local/libexec/splotch-claude-stream.mjs',
  sessionsDirectory: '/Users/kylemit/.config/splotch-run-claude/sessions',
  claudeProjects: '/Users/kylemit/.claude/projects',
  streamLogDirectory: '/private/tmp',
};

const EXPECTED_REMOTES = new Set([
  'git@github.com:KyleMit/Splotch.git',
  'https://github.com/KyleMit/Splotch.git',
]);
const PROFILES = new Set(['ask', 'inspect']);
const MODELS = new Set(['sonnet', 'opus']);
const EFFORTS = new Set(['low', 'medium', 'high']);
const MAX_PROMPT_BYTES = 256 * 1024;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE =
  'usage: splotch-claude-run.mjs --prompt-file <absolute-path> [--profile ask|inspect] [--persist | --resume <session-id>] | --end-session <session-id>';
// Exported so the production prompt boundary remains explicit under the injectable test seam.
export const ALLOWED_PROMPT_ROOTS = [
  '/private/tmp',
  '/Users/kylemit/Code/Splotch',
  '/Users/kylemit/.codex/worktrees',
];

export function parseRunArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      'prompt-file': { type: 'string' },
      profile: { type: 'string' },
      cwd: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      persist: { type: 'boolean', default: false },
      resume: { type: 'string' },
      'end-session': { type: 'string' },
    },
  });
  if (positionals.length > 0) throw new Error(USAGE);
  for (const sessionId of [values.resume, values['end-session']]) {
    if (sessionId !== undefined && !SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error('session ids must be UUIDs issued by this wrapper');
    }
  }
  if (values['end-session']) {
    const extra = Object.entries(values).filter(
      ([name, value]) => name !== 'end-session' && value !== undefined && value !== false
    );
    if (extra.length > 0) throw new Error('--end-session accepts no other options');
    return { endSession: values['end-session'] };
  }
  const options = {
    promptFile: values['prompt-file'],
    profile: values.profile ?? 'ask',
    cwd: values.cwd,
    model: values.model ?? 'sonnet',
    effort: values.effort ?? 'high',
    persist: values.persist,
    resume: values.resume,
  };
  if (!options.promptFile) throw new Error(USAGE);
  if (!PROFILES.has(options.profile)) throw new Error(`unsupported profile: ${options.profile}`);
  if (!MODELS.has(options.model)) throw new Error(`unsupported model: ${options.model}`);
  if (!EFFORTS.has(options.effort)) throw new Error(`unsupported effort: ${options.effort}`);
  if (options.profile === 'ask' && options.cwd) {
    throw new Error('--cwd is available only with --profile inspect');
  }
  if (options.profile === 'inspect' && !options.cwd) {
    throw new Error('--profile inspect requires --cwd');
  }
  if (options.persist && options.resume) {
    throw new Error('--persist and --resume are mutually exclusive');
  }
  return options;
}

function isWithin(path, root) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

// Injectable roots keep the boundary testable from noncanonical checkouts without weakening it.
export function readPromptFile(path, allowedRoots = ALLOWED_PROMPT_ROOTS) {
  if (!isAbsolute(path)) throw new Error('--prompt-file must be absolute');
  const promptPath = realpathSync(path);
  if (!allowedRoots.some((root) => isWithin(promptPath, root))) {
    throw new Error('--prompt-file must be under /private/tmp or a Splotch checkout');
  }
  const promptStats = statSync(promptPath);
  if (!promptStats.isFile()) throw new Error('--prompt-file must name a regular file');
  if (promptStats.size > MAX_PROMPT_BYTES) {
    throw new Error(`--prompt-file exceeds ${MAX_PROMPT_BYTES} bytes`);
  }
  const prompt = readFileSync(promptPath, 'utf8').trim();
  if (!prompt) throw new Error('--prompt-file is empty');
  return prompt;
}

export function buildRunnerPrompt({ prompt, profile }) {
  return `PROFILE: ${profile}

AUTHORIZED TASK

${prompt}

Return the result to the parent Codex process. This invocation authorizes no external writes,
messages, publication, commits, pushes, or changes outside the disposable Claude session.`;
}

export function sessionArguments(session = { mode: 'ephemeral' }) {
  if (session.mode === 'create') return ['--session-id', session.id];
  if (session.mode === 'resume') return ['--resume', session.id];
  if (session.mode === 'ephemeral') return ['--no-session-persistence'];
  throw new Error(`unsupported session mode: ${session.mode}`);
}

export function buildClaudeArgs(
  { prompt, profile, model, effort, session = { mode: 'ephemeral' } },
  paths = RUNNER_PATHS
) {
  const tools = profile === 'inspect' ? 'Read,Grep,Glob' : '';
  const arguments_ = ['--print', '--permission-mode', 'dontAsk', '--tools', tools];
  if (profile === 'inspect') arguments_.push('--allowedTools', tools);
  arguments_.push(
    '--safe-mode',
    '--settings',
    paths.settings,
    '--no-chrome',
    '--strict-mcp-config',
    ...sessionArguments(session),
    '--output-format',
    'stream-json',
    '--verbose',
    '--append-system-prompt-file',
    paths.boundary,
    '--model',
    model,
    '--effort',
    effort,
    buildRunnerPrompt({ prompt, profile })
  );
  return arguments_;
}

// One owner-only record file per session: concurrent wrapper invocations for different sessions
// never share writable state, so there is no cross-process read-modify-write to lose or corrupt.
export function sessionRecordPath(directory, sessionId) {
  return join(directory, `${sessionId}.json`);
}

export function readSessionRecord(directory, sessionId) {
  const path = sessionRecordPath(directory, sessionId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function createSessionRecord(directory, sessionId, record) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(sessionRecordPath(directory, sessionId), `${JSON.stringify(record, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
}

export function updateSessionRecord(directory, sessionId, record) {
  const temporary = sessionRecordPath(directory, `.${sessionId}`);
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, sessionRecordPath(directory, sessionId));
}

export function authorizeResume(record, sessionId, requestedProfile) {
  if (!record) {
    throw new Error(
      `unknown run-claude session ${sessionId}; only sessions this wrapper created with --persist can be resumed`
    );
  }
  const widensAskToInspect = record.profile === 'ask' && requestedProfile === 'inspect';
  if (record.profile !== requestedProfile && !widensAskToInspect) {
    throw new Error(
      `session ${sessionId} holds the ${record.profile} profile; resume with the same profile or widen ask to inspect`
    );
  }
  return { ...record, profile: requestedProfile };
}

function planSession(options, paths) {
  if (options.resume) {
    const record = authorizeResume(
      readSessionRecord(paths.sessionsDirectory, options.resume),
      options.resume,
      options.profile
    );
    updateSessionRecord(paths.sessionsDirectory, options.resume, {
      ...record,
      lastResumedAt: new Date().toISOString(),
    });
    return { mode: 'resume', id: options.resume };
  }
  if (options.persist) {
    const sessionId = randomUUID();
    createSessionRecord(paths.sessionsDirectory, sessionId, {
      profile: options.profile,
      createdAt: new Date().toISOString(),
    });
    return { mode: 'create', id: sessionId };
  }
  return { mode: 'ephemeral' };
}

export function endSession(sessionId, paths = RUNNER_PATHS) {
  if (!readSessionRecord(paths.sessionsDirectory, sessionId)) {
    throw new Error(
      `unknown run-claude session ${sessionId}; only sessions recorded by this wrapper can be ended`
    );
  }
  let removed = 0;
  if (existsSync(paths.claudeProjects)) {
    for (const project of readdirSync(paths.claudeProjects)) {
      for (const entry of [`${sessionId}.jsonl`, sessionId]) {
        const target = join(paths.claudeProjects, project, entry);
        if (existsSync(target)) {
          rmSync(target, { recursive: true, force: true });
          removed += 1;
        }
      }
    }
  }
  rmSync(sessionRecordPath(paths.sessionsDirectory, sessionId), { force: true });
  console.log(
    `ended session ${sessionId} (${removed} transcript path${removed === 1 ? '' : 's'} removed)`
  );
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function verifyInstallation(paths) {
  for (const path of [
    paths.settings,
    paths.boundary,
    paths.manifest,
    paths.subscriptionAuth,
    paths.stream,
  ]) {
    if (!existsSync(path)) throw new Error(`missing trusted run-claude file: ${path}`);
  }
  const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
  if (
    manifest.runnerSha256 !== digest(resolve(process.argv[1])) ||
    manifest.settingsSha256 !== digest(paths.settings) ||
    manifest.runnerBoundarySha256 !== digest(paths.boundary) ||
    manifest.subscriptionAuthSha256 !== digest(paths.subscriptionAuth) ||
    manifest.streamSha256 !== digest(paths.stream)
  ) {
    throw new Error('trusted run-claude files differ from the installed manifest; reinstall');
  }
}

function capture(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${result.status ?? 'without a status'}: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result.stdout;
}

function validateCheckout(path, paths) {
  if (!isAbsolute(path)) throw new Error('--cwd must be absolute');
  const checkout = realpathSync(path);
  const topLevel = realpathSync(
    capture(paths.git, ['-C', checkout, 'rev-parse', '--show-toplevel']).trim()
  );
  if (topLevel !== checkout) throw new Error('--cwd must name a Splotch worktree root');
  const remote = capture(paths.git, ['-C', checkout, 'remote', 'get-url', 'origin']).trim();
  if (!EXPECTED_REMOTES.has(remote)) throw new Error(`unexpected origin remote: ${remote}`);
  return checkout;
}

export async function runClaude(options, paths = RUNNER_PATHS, environment = process.env) {
  assertNoApiBillingEnvironment(environment);
  verifyInstallation(paths);
  if (options.endSession) return endSession(options.endSession, paths);
  const cwd =
    options.profile === 'inspect' ? validateCheckout(options.cwd, paths) : dirname(paths.boundary);
  const prompt = readPromptFile(options.promptFile);
  const session = planSession(options, paths);
  const logPath = join(paths.streamLogDirectory, `splotch-claude-${randomUUID()}.ndjson`);
  process.stderr.write(`stream log: ${logPath}\n`);
  if (session.mode !== 'ephemeral') process.stderr.write(`session id: ${session.id}\n`);
  const result = await runClaudeStreaming({
    command: paths.claude,
    args: buildClaudeArgs({ ...options, prompt, session }, paths),
    cwd,
    env: environment,
    logPath,
    onProgress: (line) => process.stderr.write(`${line}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runClaude(parseRunArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
