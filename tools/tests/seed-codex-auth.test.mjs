import { describe, expect, it } from 'vitest';
import {
  CODEX_TOKEN_REFRESH_INTERVAL_DAYS,
  decodeSeed,
  encodeSeed,
  SEED_ENVIRONMENT_KEY,
  SEED_WARNING_AGE_DAYS,
  seedCodexAuth,
} from '../seed-codex-auth.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-02T12:00:00Z');
const AUTH_PATH = '/home/agent/.codex/auth.json';

function planAuth(ageDays = 1) {
  return {
    auth_mode: 'chatgpt',
    tokens: { access_token: 'access', refresh_token: 'refresh' },
    last_refresh: new Date(NOW - ageDays * DAY_MS).toISOString(),
  };
}

function base64(auth) {
  return encodeSeed(auth);
}

function run({ seed, existing, remote = true, installed = true, now = NOW } = {}) {
  const writes = [];
  const env = { ...(remote ? { CLAUDE_CODE_REMOTE: 'true' } : {}) };
  if (seed !== undefined) env[SEED_ENVIRONMENT_KEY] = seed;
  const result = seedCodexAuth({
    env,
    authPath: AUTH_PATH,
    now,
    readAuth: () => existing,
    writeAuth: (path, json) => writes.push({ path, json }),
    codexInstalled: () => installed,
  });
  return { result, writes };
}

describe('cloud Codex login seed', () => {
  it('accepts the seed as base64 or raw JSON', () => {
    const auth = planAuth();
    expect(decodeSeed(base64(auth))).toEqual(auth);
    expect(decodeSeed(`  ${JSON.stringify(auth)}\n`)).toEqual(auth);
  });

  it('does nothing outside a cloud session', () => {
    const { result, writes } = run({ seed: base64(planAuth()), remote: false });
    expect(result).toEqual({ status: 'local' });
    expect(writes).toEqual([]);
  });

  it('writes a valid seed to the auth path and says so', () => {
    const { result, writes } = run({ seed: base64(planAuth()) });
    expect(result.status).toBe('seeded');
    expect(writes).toEqual([{ path: AUTH_PATH, json: JSON.stringify(planAuth()) }]);
    expect(result.message).toContain(AUTH_PATH);
    expect(result.message).not.toContain('rotates');
  });

  // Codex refreshes in place; the seed is the older credential by definition.
  it('never overwrites a login already on disk', () => {
    const { result, writes } = run({
      seed: base64(planAuth()),
      existing: '{"auth_mode":"chatgpt"}',
    });
    expect(result).toEqual({ status: 'present' });
    expect(writes).toEqual([]);
  });

  it('names the missing variable when unseeded', () => {
    const { result, writes } = run({});
    expect(result.status).toBe('unseeded');
    expect(result.message).toContain(SEED_ENVIRONMENT_KEY);
    expect(writes).toEqual([]);
  });

  it('refuses a seed that would bill the API or die at first expiry', () => {
    const apiKey = run({ seed: base64({ ...planAuth(), auth_mode: 'apikey' }) });
    expect(apiKey.result.status).toBe('invalid');
    expect(apiKey.result.message).toMatch(/chatgpt/);
    expect(apiKey.writes).toEqual([]);

    const noRefresh = run({
      seed: base64({ ...planAuth(), tokens: { access_token: 'access' } }),
    });
    expect(noRefresh.result.status).toBe('invalid');
    expect(noRefresh.result.message).toMatch(/refresh token/);

    expect(run({ seed: 'not json, not base64 json' }).result.status).toBe('invalid');
  });

  it('warns before the refresh interval retires the seed', () => {
    expect(SEED_WARNING_AGE_DAYS).toBeLessThan(CODEX_TOKEN_REFRESH_INTERVAL_DAYS);
    const fresh = run({ seed: base64(planAuth(SEED_WARNING_AGE_DAYS - 1)) });
    expect(fresh.result.message).not.toContain('rotates');
    const aging = run({ seed: base64(planAuth(SEED_WARNING_AGE_DAYS)) });
    expect(aging.result.status).toBe('seeded');
    expect(aging.result.message).toContain(`${SEED_WARNING_AGE_DAYS} days old`);
    expect(aging.result.message).toContain('re-seed');
  });

  it('points at the snapshot when the CLI is missing', () => {
    const { result, writes } = run({ seed: base64(planAuth()), installed: false });
    expect(result.status).toBe('uninstalled');
    expect(result.message).toContain('setup.sh');
    expect(writes).toEqual([]);
  });
});
