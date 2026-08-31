#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  assertSubscriptionBilling,
  SUBSCRIPTION_CREDENTIALS_STORE,
  SUBSCRIPTION_MODEL_PROVIDER,
} from './codex-subscription-auth.mjs';
import { runCodexStreaming } from './codex-stream.mjs';

const PROFILES = new Set(['review', 'ask']);
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
      cwd: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
    },
  });
  if (positionals.length > 0) throw new Error(USAGE);
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

export function buildCodexArgs(options) {
  // Read-only is the point of an independent review: Codex reads the tree and reports, and can
  // never edit the work it is reviewing. `review` takes no --sandbox flag, so both profiles set it
  // through the same config override.
  // A project-level .codex/config.toml inside the reviewed worktree can retarget model_provider at
  // higher precedence than the login guard inspects, so the subscription provider is pinned here
  // rather than only validated in $CODEX_HOME.
  const shared = [
    '--json',
    '-c',
    'sandbox_mode="read-only"',
    '-c',
    `model_provider="${SUBSCRIPTION_MODEL_PROVIDER}"`,
    '-c',
    `cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`,
  ];
  if (options.model) shared.push('-m', options.model);
  shared.push('-c', `model_reasoning_effort="${options.effort}"`);
  if (options.profile === 'ask') return ['exec', ...shared];
  // `codex exec review` refuses a scope flag and a custom PROMPT together, so focus instructions
  // and a built-in scope are alternatives: with instructions the scope moves into the prompt text
  // (see describeScope), without them the flag drives Codex's own review harness.
  if (options.hasInstructions) return ['exec', 'review', ...shared, '-'];
  const scopeFlags = {
    base: ['--base', options.base],
    uncommitted: ['--uncommitted'],
    commit: ['--commit', options.commit],
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

export function buildReviewPrompt(options, extraInstructions) {
  const preamble = `You are an independent second-opinion reviewer; you did not write this code. ${describeScope(options)} Report only defects you can point to in the diff, each anchored to a file and line, and say plainly when you find nothing.`;
  return `${preamble}\n\n${extraInstructions}`;
}

async function main() {
  const options = parseRunArgs(process.argv.slice(2));
  const { env, stripped } = assertSubscriptionBilling();
  const cwd = resolveWorktree(options.cwd);
  const extraInstructions = options.promptFile ? readPromptFile(options.promptFile) : undefined;
  const prompt =
    options.profile === 'review' && extraInstructions
      ? buildReviewPrompt(options, extraInstructions)
      : extraInstructions;
  const logPath = join(tmpdir(), `codex-run-${randomUUID()}.jsonl`);

  process.stderr.write(`stream log: ${logPath}\n`);
  if (stripped.length > 0) {
    process.stderr.write(`ignoring API-billing environment: ${stripped.join(', ')}\n`);
  }

  const result = await runCodexStreaming({
    command: 'codex',
    args: buildCodexArgs({ ...options, hasInstructions: extraInstructions !== undefined }),
    cwd,
    env,
    prompt,
    logPath,
    onProgress: (line) => process.stderr.write(`${line}\n`),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        profile: options.profile,
        scope: options.scope,
        base: options.scope === 'base' ? options.base : undefined,
        commit: options.commit,
        cwd,
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
