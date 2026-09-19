#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

// Codex refreshes the bundle, rotating the refresh token as it does, once the access token's JWT
// expiry is within this window; the day count is its fallback for a token whose expiry it cannot
// read (should_refresh_proactively in codex-rs/login/src/auth/manager.rs at the pinned version).
// Either refresh retires the seed for every VM provisioned afterwards, so the hook reports the
// expiry it can read and warns off the age fallback early enough to re-seed first.
export const CODEX_ACCESS_TOKEN_REFRESH_WINDOW_MINUTES = 5;
export const CODEX_TOKEN_REFRESH_INTERVAL_DAYS = 8;
export const SEED_WARNING_AGE_DAYS = 6;
// Sits beside auth.json and records which seed value wrote it, so a deliberately re-pasted seed
// replaces the file while a file Codex refreshed from the same seed, or wrote itself, is kept.
export const SEED_IDENTITY_SUFFIX = '.seed-id';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
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

// The access token is a JWT whose payload carries `exp`; decoded without verification because the
// only reader is this status line. Anything unparseable reads as "no expiry", the same answer Codex
// gives itself before falling back to last_refresh.
export function accessTokenExpiryMs(auth) {
  const payload = auth.tokens?.access_token?.split('.')[1];
  if (!payload) return undefined;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function seedIdentity(auth) {
  return createHash('sha256').update(JSON.stringify(auth)).digest('hex');
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

// What retires the seed, in Codex's own terms: the first review after the access token's expiry
// refreshes and rotates; with no readable expiry, the first review after the age fallback does.
export function lifetimeNote(auth, now) {
  const expiryMs = accessTokenExpiryMs(auth);
  if (expiryMs !== undefined) {
    const expiry = new Date(expiryMs).toISOString();
    if (expiryMs - now <= CODEX_ACCESS_TOKEN_REFRESH_WINDOW_MINUTES * MINUTE_MS) {
      return ` Its access token expired at ${expiry}, so the first review will refresh and rotate the refresh token, retiring this seed for every later session — ${RESEED_INSTRUCTIONS} before running one.`;
    }
    return ` Its access token expires at ${expiry}; the first review after that refreshes and rotates the refresh token, retiring this seed for every later session.`;
  }
  const ageDays = seedAgeDays(auth, now);
  if (ageDays === undefined || ageDays < SEED_WARNING_AGE_DAYS) return '';
  return ` Its access token carries no readable expiry and its last_refresh is ${Math.floor(ageDays)} days old; Codex refreshes and rotates the refresh token after ${CODEX_TOKEN_REFRESH_INTERVAL_DAYS} days, and the first review that does so retires this seed for every later session — ${RESEED_INSTRUCTIONS}.`;
}

function decodeAndValidate(seed) {
  const auth = decodeSeed(seed);
  assertSeed(auth);
  return auth;
}

function writeSeed({ auth, authPath, identityPath, writeFile, replace }) {
  writeFile(authPath, JSON.stringify(auth), { replace });
  writeFile(identityPath, seedIdentity(auth), { replace });
}

// A file on disk normally wins: Codex refreshes it in place, and the seed that wrote it is the
// older credential by definition. The exception is a seed the user deliberately replaced — the
// remedy for a retired login — which the identity sidecar distinguishes from the same seed
// arriving again. A file the hook did not write is never touched.
function seedAuth({ env, authPath, identityPath, now, readFile, writeFile }) {
  const seed = env[SEED_ENVIRONMENT_KEY];
  const existing = readFile(authPath);
  if (existing !== undefined && !seed) return { status: 'present' };
  if (!seed) {
    return {
      status: 'unseeded',
      message: `Codex login: ${SEED_ENVIRONMENT_KEY} is not set in this environment, so run-rival-agent is unavailable this session — ${RESEED_INSTRUCTIONS}.`,
    };
  }
  let auth;
  try {
    auth = decodeAndValidate(seed);
  } catch (error) {
    return {
      status: 'invalid',
      message: `Codex login: ${SEED_ENVIRONMENT_KEY} is not a ChatGPT-plan auth.json (${error.message}) — ${RESEED_INSTRUCTIONS}.`,
    };
  }
  if (existing !== undefined) {
    const recorded = readFile(identityPath)?.trim();
    if (recorded === undefined) {
      return {
        status: 'present',
        message: `Codex login: ${authPath} exists but was not written by this hook, so ${SEED_ENVIRONMENT_KEY} was left unapplied; delete that file to seed from the variable at the next session start.`,
      };
    }
    if (recorded === seedIdentity(auth)) return { status: 'present' };
    writeSeed({ auth, authPath, identityPath, writeFile, replace: true });
    return {
      status: 'replaced',
      message: `Codex login replaced from a new ${SEED_ENVIRONMENT_KEY} value; the file the previous seed wrote is discarded.${lifetimeNote(auth, now)}`,
    };
  }
  writeSeed({ auth, authPath, identityPath, writeFile, replace: false });
  return {
    status: 'seeded',
    message: `Codex login seeded from ${SEED_ENVIRONMENT_KEY} into ${authPath} for run-rival-agent.${lifetimeNote(auth, now)}`,
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
  writeFile(configPath, modelConfigToml(model), { replace: false });
  return { status: 'written', model, message: `Codex model ${model} written to ${configPath}.` };
}

export function seedCodexAuth({
  env = process.env,
  authPath = AUTH_PATH,
  identityPath = `${AUTH_PATH}${SEED_IDENTITY_SUFFIX}`,
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
  const auth = seedAuth({ env, authPath, identityPath, now, readFile, writeFile });
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

// Owner-only modes, and an exclusive create unless the caller is replacing a file it identified:
// the file is a credential, and a race with a Codex process that already wrote the path must lose
// to it rather than overwrite.
function defaultWriteFile(path, contents, { replace }) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents.endsWith('\n') ? contents : `${contents}\n`, {
    mode: 0o600,
    flag: replace ? 'w' : 'wx',
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
