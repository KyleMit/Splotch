#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../../../tools/lib/proc.mjs';
import {
  CLOUD_CLAUDE_VERSION,
  CLOUD_CLI_DIRECTORY,
  CLOUD_CONFIG_DIRECTORY,
  CLOUD_REPOSITORY,
  isManagedCloud,
  resolveClaudeRuntime,
} from './claude-runtime.mjs';
import { installRunClaude } from './install-run-claude.mjs';

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const INSTALL_TIMEOUT_MS = 180_000;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', timeout: INSTALL_TIMEOUT_MS });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
}

export function installCloudClaude({ check = false } = {}) {
  if (!isManagedCloud() || realpathSync(REPOSITORY) !== CLOUD_REPOSITORY) {
    throw new Error(`cloud installation must run from the trusted ${CLOUD_REPOSITORY} checkout`);
  }
  if (!check) {
    mkdirSync(CLOUD_CLI_DIRECTORY, { recursive: true });
    mkdirSync(CLOUD_CONFIG_DIRECTORY, { recursive: true, mode: 0o700 });
    const { packageManager } = JSON.parse(readFileSync(join(REPOSITORY, 'package.json'), 'utf8'));
    writeFileSync(
      join(CLOUD_CLI_DIRECTORY, 'package.json'),
      `${JSON.stringify(
        {
          private: true,
          packageManager,
          dependencies: { '@anthropic-ai/claude-code': CLOUD_CLAUDE_VERSION },
        },
        null,
        2
      )}\n`
    );
    run(
      'pnpm',
      ['install', '--prefer-offline', '--ignore-scripts', '--ignore-pnpmfile'],
      CLOUD_CLI_DIRECTORY
    );
    // Only the pinned vendor's installer runs; lifecycle scripts stay disabled for dependencies.
    run(
      process.execPath,
      [join(CLOUD_CLI_DIRECTORY, 'node_modules/@anthropic-ai/claude-code/install.cjs')],
      CLOUD_CLI_DIRECTORY
    );
  }
  const runtime = resolveClaudeRuntime(true);
  const version = spawnSync(runtime.command, ['--version'], {
    encoding: 'utf8',
    env: { ...process.env, ...runtime.environment },
    timeout: INSTALL_TIMEOUT_MS,
  });
  if (
    version.error ||
    version.status !== 0 ||
    !version.stdout.startsWith(`${CLOUD_CLAUDE_VERSION} `)
  ) {
    throw new Error(`Claude Code ${CLOUD_CLAUDE_VERSION} is unavailable at ${runtime.command}`);
  }
  installRunClaude({ cloud: true, check });
  console.log(`Claude Code ${CLOUD_CLAUDE_VERSION} and the cloud rival wrappers are ready`);
}

export function runCloudInstallerCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: { check: { type: 'boolean', default: false } },
  });
  installCloudClaude({ check: values.check });
}

if (isMain(import.meta.url)) {
  try {
    runCloudInstallerCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
