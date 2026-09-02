#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  stripApiBillingEnvironment,
  SUBSCRIPTION_CREDENTIALS_STORE,
} from '../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';
import {
  assertSeed,
  CODEX_TOKEN_REFRESH_INTERVAL_DAYS,
  encodeSeed,
  SEED_ENVIRONMENT_KEY,
} from './seed-codex-auth.mjs';

// A login of its own, never the working ~/.codex one: refresh rotation retires the previous token
// in the same chain, so a shared file would log the laptop out at the cloud's first refresh.
export const CLOUD_CODEX_HOME = join(homedir(), '.codex-cloud');

const CLIPBOARD_COMMANDS = Object.freeze({
  darwin: [['pbcopy']],
  linux: [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input']],
});

// The store is pinned so the login lands in auth.json, the file this script reads and the cloud
// hook writes, rather than a keyring the guard never sees.
export function buildLoginArgs() {
  return ['login', '-c', `cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`];
}

export function selectClipboardCommand(platform, isAvailable) {
  return (CLIPBOARD_COMMANDS[platform] ?? []).find(([command]) => isAvailable(command));
}

function commandExists(command) {
  return spawnSync('which', [command], { stdio: 'ignore' }).status === 0;
}

function login(env) {
  const result = spawnSync('codex', buildLoginArgs(), {
    stdio: 'inherit',
    env: { ...env, CODEX_HOME: CLOUD_CODEX_HOME },
  });
  if (result.error) throw new Error(`codex is not on PATH: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`codex login exited ${result.status ?? result.signal}`);
}

// The seed is a credential: it goes to the clipboard, or to an owner-only file when no clipboard
// tool exists, and never to the terminal.
function deliver(seed) {
  const command = selectClipboardCommand(process.platform, commandExists);
  if (command) {
    const [name, ...args] = command;
    const result = spawnSync(name, args, { input: seed, stdio: ['pipe', 'ignore', 'inherit'] });
    if (result.status === 0) return `copied to the clipboard via ${name}`;
  }
  const path = join(mkdtempSync(join(tmpdir(), 'codex-seed-')), 'CODEX_AUTH_JSON.txt');
  writeFileSync(path, seed, { mode: 0o600 });
  return `written to ${path} (no clipboard tool found) — paste its contents, then delete it`;
}

function main() {
  const { env, stripped } = stripApiBillingEnvironment();
  for (const key of stripped) process.stderr.write(`ignoring ${key} for the plan login\n`);
  login(env);
  const auth = JSON.parse(readFileSync(join(CLOUD_CODEX_HOME, 'auth.json'), 'utf8'));
  assertSeed(auth);
  const seed = encodeSeed(auth);
  process.stdout.write(
    [
      `${SEED_ENVIRONMENT_KEY} seed (${seed.length} chars) ${deliver(seed)}.`,
      'Paste it as the value of CODEX_AUTH_JSON in the Claude cloud environment dialog at https://claude.ai/code (edit the environment → Environment variables). It applies from the next session and does not rebuild the snapshot.',
      `Refresh rotation retires it after about ${CODEX_TOKEN_REFRESH_INTERVAL_DAYS} days; run this again then (docs/CLOUD/Claude.md, "Codex reviews on the ChatGPT plan").`,
      '',
    ].join('\n')
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
