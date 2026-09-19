#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  assertSubscriptionAuth,
  AUTH_PATH,
  CODEX_MODEL_SLUG_PATTERN,
  CONFIG_PATH,
  MODEL_ENVIRONMENT_KEY,
  SEED_ENVIRONMENT_KEY,
} from '../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';

// Codex refreshes a token bundle whose last_refresh is older than about eight days and rotates the
// refresh token as it does, which retires the seed for every VM provisioned afterwards. The warning
// leads that by enough for the user to re-seed before a session first trips it.
export const CODEX_TOKEN_REFRESH_INTERVAL_DAYS = 8;
export const SEED_WARNING_AGE_DAYS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESEED_INSTRUCTIONS = `re-seed ${SEED_ENVIRONMENT_KEY} with \`npm run rival:seed\` on your machine (docs/CLOUD/Claude.md, "Codex reviews on the ChatGPT plan")`;

// The environment dialog takes .env lines, where a raw JSON value's quotes and braces are at the
// mercy of its parser; base64 is the documented paste form, raw JSON is accepted for the reader who
// wants to inspect what they pasted.
export function decodeSeed(raw) {
  const trimmed = raw.trim();
  const json = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
  return JSON.parse(json);
}

export function encodeSeed(auth) {
  return Buffer.from(JSON.stringify(auth)).toString('base64');
}

export function seedAgeDays(auth, now) {
  const lastRefresh = Date.parse(auth.last_refresh ?? '');
  return Number.isNaN(lastRefresh) ? undefined : (now - lastRefresh) / DAY_MS;
}

export function assertSeed(auth) {
  assertSubscriptionAuth(auth);
  if (!auth.tokens?.refresh_token) {
    throw new Error('the seed carries no refresh token, so it would die at the first expiry');
  }
}

// `--ignore-user-config` makes the launcher read the model from a top-level `model` in config.toml
// and nowhere else, and a fresh VM has no config.toml; this is the whole file it needs.
export function modelConfigToml(model) {
  return `model = ${JSON.stringify(model)}\n`;
}

function ageWarning(ageDays) {
  if (ageDays === undefined || ageDays < SEED_WARNING_AGE_DAYS) return '';
  return ` The seed's last_refresh is ${Math.floor(ageDays)} days old; Codex rotates the refresh token after about ${CODEX_TOKEN_REFRESH_INTERVAL_DAYS} days, and the first review that does so retires this seed for every later session — ${RESEED_INSTRUCTIONS}.`;
}

// A file already on disk may hold tokens Codex refreshed in place; the seed is older by definition
// and must never overwrite it.
function seedAuth({ env, authPath, now, readFile, writeFile }) {
  if (readFile(authPath) !== undefined) return { status: 'present' };
  const seed = env[SEED_ENVIRONMENT_KEY];
  if (!seed) {
    return {
      status: 'unseeded',
      message: `Codex login: ${SEED_ENVIRONMENT_KEY} is not set in this environment, so run-rival-agent is unavailable this session — ${RESEED_INSTRUCTIONS}.`,
    };
  }
  let auth;
  try {
    auth = decodeSeed(seed);
    assertSeed(auth);
  } catch (error) {
    return {
      status: 'invalid',
      message: `Codex login: ${SEED_ENVIRONMENT_KEY} is not a ChatGPT-plan auth.json (${error.message}) — ${RESEED_INSTRUCTIONS}.`,
    };
  }
  writeFile(authPath, JSON.stringify(auth));
  const ageDays = seedAgeDays(auth, now);
  return {
    status: 'seeded',
    ageDays,
    message: `Codex login seeded from ${SEED_ENVIRONMENT_KEY} into ${authPath} for run-rival-agent.${ageWarning(ageDays)}`,
  };
}

function seedModel({ env, configPath, readFile, writeFile }) {
  if (readFile(configPath) !== undefined) return { status: 'present' };
  const model = env[MODEL_ENVIRONMENT_KEY];
  if (!model) {
    return {
      status: 'unset',
      message: `Codex model: ${MODEL_ENVIRONMENT_KEY} is not set in this environment, so rival:launch needs --model <slug> every time.`,
    };
  }
  if (!CODEX_MODEL_SLUG_PATTERN.test(model)) {
    return {
      status: 'invalid',
      message: `Codex model: ${MODEL_ENVIRONMENT_KEY}=${JSON.stringify(model)} is not a model slug, so rival:launch needs --model <slug> every time.`,
    };
  }
  writeFile(configPath, modelConfigToml(model));
  return { status: 'written', model, message: `Codex model ${model} written to ${configPath}.` };
}

export function seedCodexAuth({
  env = process.env,
  authPath = AUTH_PATH,
  configPath = CONFIG_PATH,
  now = Date.now(),
  readFile = defaultReadFile,
  writeFile = defaultWriteFile,
  codexInstalled = defaultCodexInstalled,
} = {}) {
  if (env.CLAUDE_CODE_REMOTE !== 'true') return { status: 'local' };
  if (!codexInstalled()) {
    return {
      status: 'uninstalled',
      message:
        'Codex CLI is not installed: the environment snapshot predates .claude/cloud/setup.sh installing it. Re-save the setup script in the environment dialog to rebuild the snapshot; run-rival-agent is unavailable until then.',
    };
  }
  const auth = seedAuth({ env, authPath, now, readFile, writeFile });
  const model = seedModel({ env, configPath, readFile, writeFile });
  const message = [auth.message, model.message].filter(Boolean).join(' ');
  return { status: auth.status, auth, model, ...(message ? { message } : {}) };
}

function defaultReadFile(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

// Owner-only modes and an exclusive create: the file is a credential, and a race with a Codex
// process that already wrote the path must lose to it rather than overwrite.
function defaultWriteFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents.endsWith('\n') ? contents : `${contents}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
}

function defaultCodexInstalled() {
  return spawnSync('codex', ['--version'], { stdio: 'ignore' }).status === 0;
}

// SessionStart stdout becomes session context, so the message is what the agent relays to the
// user. The hook never fails: a missing or stale login costs one skill, not the session.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const { message } = seedCodexAuth();
    if (message) process.stdout.write(`${message}\n`);
  } catch (error) {
    process.stderr.write(`seed-codex-auth.mjs: ${error.message}\n`);
  }
}
