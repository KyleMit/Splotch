#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_PATH,
  MODEL_ENVIRONMENT_KEY,
  SEED_ENVIRONMENT_KEY,
  stripApiBillingEnvironment,
  SUBSCRIPTION_CREDENTIALS_STORE,
} from '../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';
import { readConfiguredModel } from '../.claude/skills/run-rival-agent/scripts/launch-codex.mjs';
import { accessTokenExpiryMs, assertSeed, encodeSeed } from './seed-codex-auth.mjs';

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

// The cloud hook writes config.toml from CODEX_MODEL, so the laptop's own configured model is the
// value to paste beside the seed; without one the cloud launcher needs --model on every run.
export function describeModelToPaste(configToml, configPath = CONFIG_PATH) {
  const model = readConfiguredModel(configToml);
  return model
    ? `Set ${MODEL_ENVIRONMENT_KEY}=${model} beside it (the model in ${configPath}) unless the cloud should use another slug.`
    : `Also set ${MODEL_ENVIRONMENT_KEY} to the model slug the cloud rival should use; without it every cloud launch needs --model.`;
}

// What retires the seed is the first cloud review after its access token expires, which refreshes
// and rotates the refresh token; the exporter says when that is so the user knows the horizon.
export function describeSeedLifetime(auth) {
  const expiryMs = accessTokenExpiryMs(auth);
  const horizon =
    expiryMs === undefined
      ? 'its access token carries no readable expiry, so Codex refreshes on its own age fallback'
      : `its access token expires at ${new Date(expiryMs).toISOString()}`;
  return `The seed lasts until the first cloud review after ${horizon}: that review refreshes and rotates the refresh token, retiring the seed for every later session. Run this again then (docs/CLOUD/Claude.md, "Codex reviews on the ChatGPT plan").`;
}

function commandExists(command) {
  return spawnSync('which', [command], { stdio: 'ignore' }).status === 0;
}

// Codex refuses a CODEX_HOME that does not exist (it reads the directory's metadata before doing
// anything else), so the dedicated home is created, owner-only, before the login that fills it.
export function login({ env, home = CLOUD_CODEX_HOME, mkdir = mkdirSync, spawn = spawnSync }) {
  mkdir(home, { recursive: true, mode: 0o700 });
  const result = spawn('codex', buildLoginArgs(), {
    stdio: 'inherit',
    env: { ...env, CODEX_HOME: home },
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
  const path = join(mkdtempSync(join(tmpdir(), 'codex-seed-')), `${SEED_ENVIRONMENT_KEY}.txt`);
  writeFileSync(path, seed, { mode: 0o600 });
  return `written to ${path} (no clipboard tool found) — paste its contents, then delete it`;
}

function readOptional(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function main() {
  const { env, stripped } = stripApiBillingEnvironment();
  for (const key of stripped) process.stderr.write(`ignoring ${key} for the plan login\n`);
  login({ env });
  const auth = JSON.parse(readFileSync(join(CLOUD_CODEX_HOME, 'auth.json'), 'utf8'));
  assertSeed(auth);
  const seed = encodeSeed(auth);
  process.stdout.write(
    [
      `${SEED_ENVIRONMENT_KEY} seed (${seed.length} chars) ${deliver(seed)}.`,
      `Paste it as the value of ${SEED_ENVIRONMENT_KEY} in the Claude cloud environment dialog at https://claude.ai/code (edit the environment → Environment variables). It applies from the next session and does not rebuild the snapshot.`,
      describeModelToPaste(readOptional(CONFIG_PATH)),
      describeSeedLifetime(auth),
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
