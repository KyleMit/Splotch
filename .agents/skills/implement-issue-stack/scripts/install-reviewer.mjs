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
const EXPECTED_HOME = '/Users/kylemit';
const EXPECTED_REPOSITORY_ROOT = '/Users/kylemit/Code/Splotch';

export const INSTALL_PATHS = {
  wrapper: join(homedir(), '.local/libexec/splotch-claude-review-publish.mjs'),
  health: join(homedir(), '.local/libexec/splotch-claude-review-health.mjs'),
  settings: join(homedir(), '.config/splotch-claude-review/settings.json'),
  rubric: join(homedir(), '.config/splotch-claude-review/rubric.md'),
  manifest: join(homedir(), '.config/splotch-claude-review/manifest.json'),
};

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function expectedReviewerFiles() {
  const wrapper = readFileSync(join(packageDirectory, 'scripts/claude-review-publish.mjs'));
  const health = readFileSync(join(packageDirectory, 'scripts/claude-review-health.mjs'));
  const settings = readFileSync(join(packageDirectory, 'references/claude-settings.json'));
  const boundary = readFileSync(join(packageDirectory, 'references/reviewer-rubric.md'), 'utf8');
  const reviewSkill = readFileSync(
    join(repositoryRoot, '.ruler/skills/leave-pr-review/SKILL.md'),
    'utf8'
  );
  const rubric = Buffer.from(`${boundary.trimEnd()}\n\n---\n\n${reviewSkill}`);
  const manifest = Buffer.from(
    `${JSON.stringify(
      {
        version: 1,
        wrapperSha256: digest(wrapper),
        healthSha256: digest(health),
        settingsSha256: digest(settings),
        rubricSha256: digest(rubric),
      },
      null,
      2
    )}\n`
  );
  return { wrapper, health, settings, rubric, manifest };
}

function isCurrent(paths, expected) {
  return Object.entries(expected).every(
    ([name, content]) => existsSync(paths[name]) && readFileSync(paths[name]).equals(content)
  );
}

export function installReviewer({ check = false, paths = INSTALL_PATHS } = {}) {
  if (homedir() !== EXPECTED_HOME || repositoryRoot !== EXPECTED_REPOSITORY_ROOT) {
    throw new Error('this trusted reviewer installer is fixed to /Users/kylemit/Code/Splotch');
  }
  const expected = expectedReviewerFiles();
  if (check) {
    if (!isCurrent(paths, expected))
      throw new Error('trusted reviewer is missing or stale; run npm run issue-stack:install');
    console.log('trusted issue-stack reviewer is installed and current');
    return;
  }

  for (const path of Object.values(paths)) mkdirSync(dirname(path), { recursive: true });
  for (const path of Object.values(paths)) if (existsSync(path)) chmodSync(path, 0o644);
  for (const [name, content] of Object.entries(expected)) writeFileSync(paths[name], content);
  chmodSync(paths.wrapper, 0o555);
  chmodSync(paths.health, 0o555);
  chmodSync(paths.settings, 0o444);
  chmodSync(paths.rubric, 0o444);
  chmodSync(paths.manifest, 0o444);
  console.log(`installed trusted reviewer at ${paths.wrapper}`);
}

export function runInstallerCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: { check: { type: 'boolean', default: false } },
  });
  installReviewer({ check: values.check });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runInstallerCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
