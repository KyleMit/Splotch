#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertClaudePlanAuthentication,
  assertNoApiBillingEnvironment,
} from './splotch-claude-subscription-auth.mjs';

export const HEALTH_PATHS = {
  claude: '/Users/kylemit/.local/bin/claude',
  manifest: '/Users/kylemit/.config/splotch-run-claude/manifest.json',
  subscriptionAuth: '/Users/kylemit/.local/libexec/splotch-claude-subscription-auth.mjs',
};

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function capture(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${result.status ?? 'without a status'}: ${result.stderr.trim()}`
    );
  }
  return result.stdout;
}

export function checkClaudeAuthentication(environment = process.env) {
  assertNoApiBillingEnvironment(environment);
  const manifest = JSON.parse(readFileSync(HEALTH_PATHS.manifest, 'utf8'));
  if (
    manifest.healthSha256 !== digest(resolve(process.argv[1])) ||
    manifest.subscriptionAuthSha256 !== digest(HEALTH_PATHS.subscriptionAuth)
  ) {
    throw new Error('trusted Claude health files differ from the installed manifest');
  }
  assertClaudePlanAuthentication(JSON.parse(capture(HEALTH_PATHS.claude, ['auth', 'status'])));
  console.log('Claude plan authentication is available outside the Codex sandbox');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2)
      throw new Error('splotch-claude-health.mjs accepts no arguments');
    checkClaudeAuthentication();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
