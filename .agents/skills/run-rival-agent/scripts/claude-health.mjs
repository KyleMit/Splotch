#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertClaudePlanAuthentication,
  assertNoApiBillingEnvironment,
} from './splotch-claude-subscription-auth.mjs';
import { isEntryPoint } from '../../../../tools/rival-agent/broker-server.mjs';

export const CLAUDE_PATH = '/Users/kylemit/.local/bin/claude';
export const MANIFEST_NAME = 'manifest.json';

export function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

// Installed wrappers run outside Codex's sandbox, so the bytes that run must be the bytes the
// installer wrote: every sibling of the manifest is hashed and compared. In the checkout there is
// no manifest and nothing to verify — the checkout is the source.
export function verifyInstalledBytes(directory) {
  const manifestPath = join(directory, MANIFEST_NAME);
  if (!existsSync(manifestPath)) return { installed: false };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const present = readdirSync(directory).filter((name) => name !== MANIFEST_NAME);
  const expected = Object.keys(manifest.files);
  const missing = expected.filter((name) => !present.includes(name));
  const unexpected = present.filter((name) => !expected.includes(name));
  const changed = expected.filter(
    (name) =>
      !missing.includes(name) &&
      digest(readFileSync(join(directory, name))) !== manifest.files[name]
  );
  if (missing.length > 0 || unexpected.length > 0 || changed.length > 0) {
    throw new Error(
      `installed rival-agent files differ from the manifest (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}; changed: ${changed.join(', ') || 'none'}); reinstall`
    );
  }
  return { installed: true, version: manifest.version };
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
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
  const installation = verifyInstalledBytes(dirname(fileURLToPath(import.meta.url)));
  assertClaudePlanAuthentication(JSON.parse(capture(CLAUDE_PATH, ['auth', 'status'])));
  return installation;
}

export function main() {
  try {
    if (process.argv.length !== 2) throw new Error('claude-health.mjs accepts no arguments');
    const installation = checkClaudeAuthentication();
    console.log(
      `Claude plan authentication is available outside the Codex sandbox${installation.installed ? ` (installed rival-agent v${installation.version})` : ''}`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url)) main();
