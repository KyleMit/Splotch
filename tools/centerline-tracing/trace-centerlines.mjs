#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../lib/proc.mjs';

const CAPABILITY_ROOT = dirname(fileURLToPath(import.meta.url));
const UV_SETUP_COMMAND = 'brew install uv  # macOS; see https://docs.astral.sh/uv/ on Linux';

function hasUv() {
  const probe = spawnSync('uv', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
  return !probe.error && probe.status === 0;
}

export function traceCenterlines(args) {
  if (!hasUv()) {
    process.stderr.write(
      `centerline tracing requires uv; install it first:\n  ${UV_SETUP_COMMAND}\n`
    );
    return 1;
  }

  const result = spawnSync(
    'uv',
    [
      'run',
      '--project',
      CAPABILITY_ROOT,
      '--locked',
      '--no-dev',
      'python',
      '-m',
      'centerline_tracing.cli',
      ...args,
    ],
    { cwd: process.cwd(), stdio: 'inherit' }
  );
  if (result.error) {
    process.stderr.write(`centerline tracing failed to start: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

if (isMain(import.meta.url)) process.exitCode = traceCenterlines(process.argv.slice(2));
