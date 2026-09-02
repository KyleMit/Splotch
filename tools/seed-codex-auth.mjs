#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  assertSubscriptionAuth,
  AUTH_PATH,
} from '../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';

export const SEED_ENVIRONMENT_KEY = 'CODEX_AUTH_JSON';
// Codex refreshes a token bundle whose last_refresh is older than about eight days and rotates the
// refresh token as it does, which retires the seed for every VM provisioned afterwards. The warning
// leads that by enough for the user to re-seed before a session first trips it.
export const CODEX_TOKEN_REFRESH_INTERVAL_DAYS = 8;
export const SEED_WARNING_AGE_DAYS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESEED_INSTRUCTIONS =
  "re-seed CODEX_AUTH_JSON from a dedicated login (docs/CLOUD/Claude.md, 'Codex reviews on the ChatGPT plan')";

// The environment dialog takes .env lines, where a raw JSON value's quotes and braces are at the
// mercy of its parser; base64 is the documented paste form, raw JSON is accepted for the reader who
// wants to inspect what they pasted.
export function decodeSeed(raw) {
  const trimmed = raw.trim();
  const json = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
  return JSON.parse(json);
}

export function seedAgeDays(auth, now) {
  const lastRefresh = Date.parse(auth.last_refresh ?? '');
  return Number.isNaN(lastRefresh) ? undefined : (now - lastRefresh) / DAY_MS;
}

function assertSeed(auth) {
  assertSubscriptionAuth(auth);
  if (!auth.tokens?.refresh_token) {
    throw new Error('the seed carries no refresh token, so it would die at the first expiry');
  }
}

function ageWarning(ageDays) {
  if (ageDays === undefined || ageDays < SEED_WARNING_AGE_DAYS) return '';
  return ` The seed's last_refresh is ${Math.floor(ageDays)} days old; Codex rotates the refresh token after about ${CODEX_TOKEN_REFRESH_INTERVAL_DAYS} days, and the first review that does so retires this seed for every later session — ${RESEED_INSTRUCTIONS}.`;
}

export function seedCodexAuth({
  env = process.env,
  authPath = AUTH_PATH,
  now = Date.now(),
  readAuth = defaultReadAuth,
  writeAuth = defaultWriteAuth,
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
  // A file already on disk may hold tokens Codex refreshed in place; the seed is older by definition
  // and must never overwrite it.
  if (readAuth(authPath) !== undefined) return { status: 'present' };
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
  writeAuth(authPath, JSON.stringify(auth));
  const ageDays = seedAgeDays(auth, now);
  return {
    status: 'seeded',
    ageDays,
    message: `Codex login seeded from ${SEED_ENVIRONMENT_KEY} into ${authPath} for run-rival-agent.${ageWarning(ageDays)}`,
  };
}

function defaultReadAuth(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function defaultWriteAuth(path, json) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${json}\n`, { mode: 0o600, flag: 'wx' });
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
