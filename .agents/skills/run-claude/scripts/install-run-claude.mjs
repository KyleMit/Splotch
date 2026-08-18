#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(packageDirectory, '../../..');
// Exported so the drift guard can normalize homedir()-based paths on noncanonical hosts.
export const EXPECTED_HOME = '/Users/kylemit';
const EXPECTED_REPOSITORY_ROOT = '/Users/kylemit/Code/Splotch';

export const INSTALL_PATHS = {
  runner: join(homedir(), '.local/libexec/splotch-claude-run.mjs'),
  reviewer: join(homedir(), '.local/libexec/splotch-claude-review-publish.mjs'),
  health: join(homedir(), '.local/libexec/splotch-claude-health.mjs'),
  subscriptionAuth: join(homedir(), '.local/libexec/splotch-claude-subscription-auth.mjs'),
  stream: join(homedir(), '.local/libexec/splotch-claude-stream.mjs'),
  settings: join(homedir(), '.config/splotch-run-claude/settings.json'),
  runnerBoundary: join(homedir(), '.config/splotch-run-claude/runner-boundary.md'),
  rubric: join(homedir(), '.config/splotch-run-claude/reviewer-rubric.md'),
  manifest: join(homedir(), '.config/splotch-run-claude/manifest.json'),
};

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function expectedRunClaudeFiles() {
  const runner = readFileSync(join(packageDirectory, 'scripts/claude-run.mjs'));
  const reviewer = readFileSync(join(packageDirectory, 'scripts/claude-review-publish.mjs'));
  const health = readFileSync(join(packageDirectory, 'scripts/claude-health.mjs'));
  const subscriptionAuth = readFileSync(
    join(packageDirectory, 'scripts/splotch-claude-subscription-auth.mjs')
  );
  const stream = readFileSync(join(packageDirectory, 'scripts/splotch-claude-stream.mjs'));
  const settings = readFileSync(join(packageDirectory, 'references/claude-settings.json'));
  const runnerBoundary = readFileSync(join(packageDirectory, 'references/runner-boundary.md'));
  const reviewerBoundary = readFileSync(
    join(packageDirectory, 'references/reviewer-rubric.md'),
    'utf8'
  );
  const reviewSkill = readFileSync(
    join(repositoryRoot, '.ruler/skills/leave-pr-review/SKILL.md'),
    'utf8'
  );
  const rubric = Buffer.from(`${reviewerBoundary.trimEnd()}\n\n---\n\n${reviewSkill}`);
  const manifest = Buffer.from(
    `${JSON.stringify(
      {
        version: 4,
        runnerSha256: digest(runner),
        reviewerSha256: digest(reviewer),
        healthSha256: digest(health),
        subscriptionAuthSha256: digest(subscriptionAuth),
        streamSha256: digest(stream),
        settingsSha256: digest(settings),
        runnerBoundarySha256: digest(runnerBoundary),
        rubricSha256: digest(rubric),
      },
      null,
      2
    )}\n`
  );
  return {
    runner,
    reviewer,
    health,
    subscriptionAuth,
    stream,
    settings,
    runnerBoundary,
    rubric,
    manifest,
  };
}

function isCurrent(paths, expected) {
  return Object.entries(expected).every(
    ([name, content]) => existsSync(paths[name]) && readFileSync(paths[name]).equals(content)
  );
}

export function installRunClaude({ check = false, paths = INSTALL_PATHS } = {}) {
  if (homedir() !== EXPECTED_HOME || (!check && repositoryRoot !== EXPECTED_REPOSITORY_ROOT)) {
    throw new Error('this trusted run-claude installer is fixed to /Users/kylemit/Code/Splotch');
  }
  const expected = expectedRunClaudeFiles();
  if (check) {
    if (!isCurrent(paths, expected)) {
      throw new Error('run-claude is missing or stale; run npm run run-claude:install');
    }
    console.log('trusted run-claude installation is current');
    return;
  }

  for (const path of Object.values(paths)) mkdirSync(dirname(path), { recursive: true });
  for (const path of Object.values(paths)) if (existsSync(path)) chmodSync(path, 0o644);
  for (const [name, content] of Object.entries(expected)) writeFileSync(paths[name], content);
  for (const path of [paths.runner, paths.reviewer, paths.health]) chmodSync(path, 0o555);
  for (const path of [
    paths.subscriptionAuth,
    paths.stream,
    paths.settings,
    paths.runnerBoundary,
    paths.rubric,
    paths.manifest,
  ]) {
    chmodSync(path, 0o444);
  }
  console.log(`installed trusted Claude runner at ${paths.runner}`);
}

export function runInstallerCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: { check: { type: 'boolean', default: false } },
  });
  installRunClaude({ check: values.check });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runInstallerCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
