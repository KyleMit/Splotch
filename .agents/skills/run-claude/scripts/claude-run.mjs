#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertNoApiBillingEnvironment } from './splotch-claude-subscription-auth.mjs';

export const RUNNER_PATHS = {
  claude: '/Users/kylemit/.local/bin/claude',
  git: '/usr/bin/git',
  settings: '/Users/kylemit/.config/splotch-run-claude/settings.json',
  boundary: '/Users/kylemit/.config/splotch-run-claude/runner-boundary.md',
  manifest: '/Users/kylemit/.config/splotch-run-claude/manifest.json',
  subscriptionAuth: '/Users/kylemit/.local/libexec/splotch-claude-subscription-auth.mjs',
};

const EXPECTED_REMOTES = new Set([
  'git@github.com:KyleMit/Splotch.git',
  'https://github.com/KyleMit/Splotch.git',
]);
const PROFILES = new Set(['ask', 'inspect']);
const MODELS = new Set(['sonnet', 'opus']);
const EFFORTS = new Set(['low', 'medium', 'high']);
const MAX_PROMPT_BYTES = 256 * 1024;
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
      profile: { type: 'string', default: 'ask' },
      cwd: { type: 'string' },
      model: { type: 'string', default: 'sonnet' },
      effort: { type: 'string', default: 'high' },
    },
  });
  if (positionals.length > 0 || !values['prompt-file']) {
    throw new Error(
      'usage: splotch-claude-run.mjs --prompt-file <absolute-path> [--profile ask|inspect]'
    );
  }
  if (!PROFILES.has(values.profile)) throw new Error(`unsupported profile: ${values.profile}`);
  if (!MODELS.has(values.model)) throw new Error(`unsupported model: ${values.model}`);
  if (!EFFORTS.has(values.effort)) throw new Error(`unsupported effort: ${values.effort}`);
  if (values.profile === 'ask' && values.cwd) {
    throw new Error('--cwd is available only with --profile inspect');
  }
  if (values.profile === 'inspect' && !values.cwd) {
    throw new Error('--profile inspect requires --cwd');
  }
  return {
    promptFile: values['prompt-file'],
    profile: values.profile,
    cwd: values.cwd,
    model: values.model,
    effort: values.effort,
  };
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

export function buildClaudeArgs({ prompt, profile, model, effort }, paths = RUNNER_PATHS) {
  const tools = profile === 'inspect' ? 'Read,Grep,Glob' : '';
  const arguments_ = ['--print', '--permission-mode', 'dontAsk', '--tools', tools];
  if (profile === 'inspect') arguments_.push('--allowedTools', tools);
  arguments_.push(
    '--safe-mode',
    '--settings',
    paths.settings,
    '--no-chrome',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format',
    'json',
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

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function verifyInstallation(paths) {
  for (const path of [paths.settings, paths.boundary, paths.manifest, paths.subscriptionAuth]) {
    if (!existsSync(path)) throw new Error(`missing trusted run-claude file: ${path}`);
  }
  const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
  if (
    manifest.runnerSha256 !== digest(resolve(process.argv[1])) ||
    manifest.settingsSha256 !== digest(paths.settings) ||
    manifest.runnerBoundarySha256 !== digest(paths.boundary) ||
    manifest.subscriptionAuthSha256 !== digest(paths.subscriptionAuth)
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

export function runClaude(options, paths = RUNNER_PATHS, environment = process.env) {
  assertNoApiBillingEnvironment(environment);
  verifyInstallation(paths);
  const cwd =
    options.profile === 'inspect' ? validateCheckout(options.cwd, paths) : dirname(paths.boundary);
  const prompt = readPromptFile(options.promptFile);
  const output = capture(paths.claude, buildClaudeArgs({ ...options, prompt }, paths), {
    cwd,
    env: environment,
  });
  process.stdout.write(output);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runClaude(parseRunArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
