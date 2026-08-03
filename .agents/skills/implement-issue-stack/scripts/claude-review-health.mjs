#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLAUDE = '/Users/kylemit/.local/bin/claude';
const GH = '/opt/homebrew/bin/gh';
const MANIFEST = '/Users/kylemit/.config/splotch-claude-review/manifest.json';

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

export function checkReviewerAuthentication() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (manifest.healthSha256 !== digest(resolve(process.argv[1]))) {
    throw new Error('trusted reviewer health wrapper differs from the installed manifest');
  }
  const claudeStatus = JSON.parse(capture(CLAUDE, ['auth', 'status']));
  if (claudeStatus.loggedIn !== true) throw new Error('Claude is not authenticated');
  capture(GH, ['auth', 'status', '--hostname', 'github.com']);
  console.log('Claude and GitHub authentication are available outside the Codex sandbox');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('claude-review-health.mjs accepts no arguments');
    checkReviewerAuthentication();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
