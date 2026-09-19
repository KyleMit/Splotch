import { describe, expect, it } from 'vitest';
import {
  CODEX_TOKEN_REFRESH_INTERVAL_DAYS,
  decodeSeed,
  encodeSeed,
  modelConfigToml,
  SEED_WARNING_AGE_DAYS,
  seedCodexAuth,
} from '../seed-codex-auth.mjs';
import {
  MODEL_ENVIRONMENT_KEY,
  SEED_ENVIRONMENT_KEY,
} from '../../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';
import { readConfiguredModel } from '../../.claude/skills/run-rival-agent/scripts/launch-codex.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-02T12:00:00Z');
const AUTH_PATH = '/home/agent/.codex/auth.json';
const CONFIG_PATH = '/home/agent/.codex/config.toml';

function planAuth(ageDays = 1) {
  return {
    auth_mode: 'chatgpt',
    tokens: { access_token: 'access', refresh_token: 'refresh' },
    last_refresh: new Date(NOW - ageDays * DAY_MS).toISOString(),
  };
}

function run({
  seed,
  model,
  existingAuth,
  existingConfig,
  remote = true,
  installed = true,
  now = NOW,
} = {}) {
  const writes = [];
  const env = { ...(remote ? { CLAUDE_CODE_REMOTE: 'true' } : {}) };
  if (seed !== undefined) env[SEED_ENVIRONMENT_KEY] = seed;
  if (model !== undefined) env[MODEL_ENVIRONMENT_KEY] = model;
  const existing = { [AUTH_PATH]: existingAuth, [CONFIG_PATH]: existingConfig };
  const result = seedCodexAuth({
    env,
    authPath: AUTH_PATH,
    configPath: CONFIG_PATH,
    now,
    readFile: (path) => existing[path],
    writeFile: (path, contents) => writes.push({ path, contents }),
    codexInstalled: () => installed,
  });
  return { result, writes };
}

describe('cloud Codex login seed', () => {
  it('accepts the seed as base64 or raw JSON, and round-trips its own encoder', () => {
    const auth = planAuth();
    expect(decodeSeed(encodeSeed(auth))).toEqual(auth);
    expect(encodeSeed(auth)).not.toContain('"');
    expect(decodeSeed(`  ${JSON.stringify(auth)}\n`)).toEqual(auth);
  });

  it('does nothing outside a cloud session', () => {
    const { result, writes } = run({ seed: encodeSeed(planAuth()), remote: false });
    expect(result).toEqual({ status: 'local' });
    expect(writes).toEqual([]);
  });

  it('writes a valid seed to the auth path and says so', () => {
    const { result, writes } = run({ seed: encodeSeed(planAuth()), existingConfig: 'model = "x"' });
    expect(result.status).toBe('seeded');
    expect(writes).toEqual([{ path: AUTH_PATH, contents: JSON.stringify(planAuth()) }]);
    expect(result.message).toContain(AUTH_PATH);
    expect(result.message).not.toContain('rotates');
  });

  // Codex refreshes in place; the seed is the older credential by definition.
  it('never overwrites a login or a config already on disk', () => {
    const { result, writes } = run({
      seed: encodeSeed(planAuth()),
      model: 'gpt-5.6-sol',
      existingAuth: '{"auth_mode":"chatgpt"}',
      existingConfig: 'model = "other"\n',
    });
    expect(result.status).toBe('present');
    expect(result.model.status).toBe('present');
    expect(result.message).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it('names the missing variable when unseeded', () => {
    const { result, writes } = run({ existingConfig: 'model = "x"' });
    expect(result.status).toBe('unseeded');
    expect(result.message).toContain(SEED_ENVIRONMENT_KEY);
    expect(result.message).toContain('rival:seed');
    expect(writes).toEqual([]);
  });

  it('refuses a seed that would bill the API or die at first expiry', () => {
    const apiKey = run({ seed: encodeSeed({ ...planAuth(), auth_mode: 'apikey' }) });
    expect(apiKey.result.status).toBe('invalid');
    expect(apiKey.result.message).toMatch(/chatgpt/);
    expect(apiKey.writes.map((write) => write.path)).not.toContain(AUTH_PATH);

    const noRefresh = run({
      seed: encodeSeed({ ...planAuth(), tokens: { access_token: 'access' } }),
    });
    expect(noRefresh.result.status).toBe('invalid');
    expect(noRefresh.result.message).toMatch(/refresh token/);

    expect(run({ seed: 'not json, not base64 json' }).result.status).toBe('invalid');
  });

  it('warns before the refresh interval retires the seed', () => {
    expect(SEED_WARNING_AGE_DAYS).toBeLessThan(CODEX_TOKEN_REFRESH_INTERVAL_DAYS);
    const fresh = run({ seed: encodeSeed(planAuth(SEED_WARNING_AGE_DAYS - 1)) });
    expect(fresh.result.message).not.toContain('rotates');
    const aging = run({ seed: encodeSeed(planAuth(SEED_WARNING_AGE_DAYS)) });
    expect(aging.result.status).toBe('seeded');
    expect(aging.result.message).toContain(`${SEED_WARNING_AGE_DAYS} days old`);
    expect(aging.result.message).toContain('re-seed');
  });

  it('points at the snapshot when the CLI is missing', () => {
    const { result, writes } = run({ seed: encodeSeed(planAuth()), installed: false });
    expect(result.status).toBe('uninstalled');
    expect(result.message).toContain('setup.sh');
    expect(writes).toEqual([]);
  });
});

// `--ignore-user-config` leaves the launcher one place to find a model: the top-level `model` of
// config.toml, which a fresh VM does not have.
describe('cloud Codex model seed', () => {
  it('writes the config the launcher reads back', () => {
    const { result, writes } = run({ seed: encodeSeed(planAuth()), model: 'gpt-5.6-sol' });
    expect(result.model).toMatchObject({ status: 'written', model: 'gpt-5.6-sol' });
    const config = writes.find((write) => write.path === CONFIG_PATH);
    expect(config.contents).toBe(modelConfigToml('gpt-5.6-sol'));
    expect(readConfiguredModel(config.contents)).toBe('gpt-5.6-sol');
    expect(result.message).toContain('gpt-5.6-sol');
  });

  it('says what an unset or flag-shaped model costs without touching the login', () => {
    const unset = run({ seed: encodeSeed(planAuth()) });
    expect(unset.result.status).toBe('seeded');
    expect(unset.result.model.status).toBe('unset');
    expect(unset.result.message).toContain(MODEL_ENVIRONMENT_KEY);
    expect(unset.result.message).toContain('--model');
    expect(unset.writes.map((write) => write.path)).toEqual([AUTH_PATH]);

    const flag = run({ seed: encodeSeed(planAuth()), model: '--yolo' });
    expect(flag.result.model.status).toBe('invalid');
    expect(flag.writes.map((write) => write.path)).toEqual([AUTH_PATH]);
  });
});
