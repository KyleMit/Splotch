import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  accessTokenExpiryMs,
  CODEX_ACCESS_TOKEN_REFRESH_WINDOW_MINUTES,
  CODEX_TOKEN_REFRESH_INTERVAL_DAYS,
  decodeSeed,
  encodeSeed,
  modelConfigToml,
  SEED_WARNING_AGE_DAYS,
  seedCodexAuth,
  seedIdentity,
} from '../seed-codex-auth.mjs';
import {
  MODEL_ENVIRONMENT_KEY,
  SEED_ENVIRONMENT_KEY,
} from '../../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';
import { readConfiguredModel } from '../../.claude/skills/run-rival-agent/scripts/launch-codex.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-02T12:00:00Z');
const AUTH_PATH = '/home/agent/.codex/auth.json';
const IDENTITY_PATH = '/home/agent/.codex/auth.json.seed-id';
const CONFIG_PATH = '/home/agent/.codex/config.toml';

// An opaque access token reads as "no expiry", which is what makes the age fallback the live rule.
function planAuth(ageDays = 1, accessToken = 'access') {
  return {
    auth_mode: 'chatgpt',
    tokens: { access_token: accessToken, refresh_token: 'refresh' },
    last_refresh: new Date(NOW - ageDays * DAY_MS).toISOString(),
  };
}

function jwt(expMs) {
  return `h.${Buffer.from(JSON.stringify({ exp: expMs / 1000 })).toString('base64url')}.s`;
}

function run({
  seed,
  model,
  existingAuth,
  existingIdentity,
  existingConfig,
  remote = true,
  installed = true,
  now = NOW,
} = {}) {
  const writes = [];
  const env = { ...(remote ? { CLAUDE_CODE_REMOTE: 'true' } : {}) };
  if (seed !== undefined) env[SEED_ENVIRONMENT_KEY] = seed;
  if (model !== undefined) env[MODEL_ENVIRONMENT_KEY] = model;
  const existing = {
    [AUTH_PATH]: existingAuth,
    [IDENTITY_PATH]: existingIdentity,
    [CONFIG_PATH]: existingConfig,
  };
  const result = seedCodexAuth({
    env,
    authPath: AUTH_PATH,
    identityPath: IDENTITY_PATH,
    configPath: CONFIG_PATH,
    now,
    readFile: (path) => existing[path],
    writeFile: (path, contents, { replace }) => writes.push({ path, contents, replace }),
    removeFile: (path) => writes.push({ path, removed: true }),
    codexInstalled: () => installed,
  });
  return { result, writes };
}

// The sidecar is dropped before the credential lands and recreated exclusively after it.
const seedWrites = (auth, replace) => [
  { path: IDENTITY_PATH, removed: true },
  { path: AUTH_PATH, contents: JSON.stringify(auth), replace },
  { path: IDENTITY_PATH, contents: seedIdentity(auth), replace: false },
];

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

  it('writes a valid seed and its identity to the auth path and says so', () => {
    const { result, writes } = run({ seed: encodeSeed(planAuth()), existingConfig: 'model = "x"' });
    expect(result.status).toBe('seeded');
    expect(writes).toEqual(seedWrites(planAuth(), false));
    expect(result.message).toContain(AUTH_PATH);
    expect(result.message).not.toContain('rotates');
  });

  // Codex refreshes in place; a file the same seed wrote is newer than the seed by definition.
  it('keeps a login the same seed already wrote, and a config already on disk', () => {
    const { result, writes } = run({
      seed: encodeSeed(planAuth()),
      model: 'gpt-5.6-sol',
      existingAuth: '{"auth_mode":"chatgpt","tokens":{"access_token":"refreshed"}}',
      existingIdentity: `${seedIdentity(planAuth())}\n`,
      existingConfig: 'model = "other"\n',
    });
    expect(result.status).toBe('present');
    expect(result.model.status).toBe('present');
    expect(result.message).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it('keeps a login without a seed, whatever is on disk', () => {
    const { result, writes } = run({ existingAuth: '{}', existingConfig: 'model = "x"' });
    expect(result).toMatchObject({ status: 'present' });
    expect(result.message).toBeUndefined();
    expect(writes).toEqual([]);
  });

  // The remedy for a login retired elsewhere is a new seed; a resumed VM still holding the file the
  // old seed wrote must take it, or re-pasting repairs nothing.
  it('replaces a login the previous seed wrote when the seed value changes', () => {
    const next = { ...planAuth(), tokens: { access_token: 'next', refresh_token: 'next' } };
    const { result, writes } = run({
      seed: encodeSeed(next),
      existingAuth: JSON.stringify(planAuth()),
      existingIdentity: seedIdentity(planAuth()),
      existingConfig: 'model = "x"',
    });
    expect(result.status).toBe('replaced');
    expect(writes).toEqual(seedWrites(next, true));
    expect(result.message).toContain('replaced');
  });

  it('leaves a login it did not write and says why the seed went unapplied', () => {
    const { result, writes } = run({
      seed: encodeSeed(planAuth()),
      existingAuth: '{"auth_mode":"chatgpt"}',
      existingConfig: 'model = "x"',
    });
    expect(result.status).toBe('present');
    expect(result.message).toContain('not written by this hook');
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

  // Codex refreshes, and rotates, once the access token's JWT expiry is within its window; the
  // last_refresh age is only its fallback for a token with no readable expiry.
  it('reads the access token expiry as the seed lifetime', () => {
    expect(accessTokenExpiryMs(planAuth(1, jwt(NOW + DAY_MS)))).toBe(NOW + DAY_MS);
    expect(accessTokenExpiryMs(planAuth())).toBeUndefined();
    expect(accessTokenExpiryMs({ tokens: { access_token: 'a.notbase64json.c' } })).toBeUndefined();

    const live = run({ seed: encodeSeed(planAuth(1, jwt(NOW + DAY_MS))) });
    expect(live.result.status).toBe('seeded');
    expect(live.result.message).toContain(`expires at ${new Date(NOW + DAY_MS).toISOString()}`);
    expect(live.result.message).not.toContain('re-seed');

    const windowMs = CODEX_ACCESS_TOKEN_REFRESH_WINDOW_MINUTES * 60 * 1000;
    for (const expMs of [NOW - DAY_MS, NOW + windowMs]) {
      const expired = run({ seed: encodeSeed(planAuth(1, jwt(expMs))) });
      expect(expired.result.status).toBe('seeded');
      expect(expired.result.message).toContain(`expired at ${new Date(expMs).toISOString()}`);
      expect(expired.result.message).toContain('re-seed');
    }
  });

  it('falls back to the last_refresh age when the token carries no expiry', () => {
    expect(SEED_WARNING_AGE_DAYS).toBeLessThan(CODEX_TOKEN_REFRESH_INTERVAL_DAYS);
    const fresh = run({ seed: encodeSeed(planAuth(SEED_WARNING_AGE_DAYS - 1)) });
    expect(fresh.result.message).not.toContain('rotates');
    const aging = run({ seed: encodeSeed(planAuth(SEED_WARNING_AGE_DAYS)) });
    expect(aging.result.status).toBe('seeded');
    expect(aging.result.message).toContain('no readable expiry');
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
    expect(config).toMatchObject({ contents: modelConfigToml('gpt-5.6-sol'), replace: false });
    expect(readConfiguredModel(config.contents)).toBe('gpt-5.6-sol');
    expect(result.message).toContain('gpt-5.6-sol');
  });

  it('says what an unset or flag-shaped model costs without touching the login', () => {
    const unset = run({ seed: encodeSeed(planAuth()) });
    expect(unset.result.status).toBe('seeded');
    expect(unset.result.model.status).toBe('unset');
    expect(unset.result.message).toContain(MODEL_ENVIRONMENT_KEY);
    expect(unset.result.message).toContain('--model');
    expect(unset.writes.filter((write) => !write.removed).map((write) => write.path)).toEqual([
      AUTH_PATH,
      IDENTITY_PATH,
    ]);

    const flag = run({ seed: encodeSeed(planAuth()), model: '--yolo' });
    expect(flag.result.model.status).toBe('invalid');
    expect(flag.writes.filter((write) => !write.removed).map((write) => write.path)).toEqual([
      AUTH_PATH,
      IDENTITY_PATH,
    ]);
  });
});

// On a real filesystem, with the hook's own read, write, and remove: the credential and its sidecar
// have independent lifetimes, and a sidecar left behind by a deleted credential must neither block
// the next seed nor survive to misidentify it.
describe('cloud Codex seed on disk', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function home() {
    const root = mkdtempSync(join(tmpdir(), 'codex-seed-disk-'));
    roots.push(root);
    const authPath = join(root, 'codex', 'auth.json');
    return {
      authPath,
      identityPath: `${authPath}.seed-id`,
      configPath: join(root, 'codex', 'config.toml'),
    };
  }

  function start(paths, seed) {
    return seedCodexAuth({
      ...paths,
      env: {
        CLAUDE_CODE_REMOTE: 'true',
        [SEED_ENVIRONMENT_KEY]: seed,
        [MODEL_ENVIRONMENT_KEY]: 'gpt-5.6-sol',
      },
      now: NOW,
      codexInstalled: () => true,
    });
  }

  it('recreates a deleted credential over a leftover sidecar, then preserves its refresh', () => {
    const paths = home();
    const a = planAuth();
    const b = { ...planAuth(), tokens: { access_token: 'b', refresh_token: 'b' } };

    expect(start(paths, encodeSeed(a)).status).toBe('seeded');
    unlinkSync(paths.authPath);
    expect(existsSync(paths.identityPath)).toBe(true);

    expect(start(paths, encodeSeed(b)).status).toBe('seeded');
    expect(JSON.parse(readFileSync(paths.authPath, 'utf8'))).toEqual(b);
    expect(readFileSync(paths.identityPath, 'utf8').trim()).toBe(seedIdentity(b));

    const refreshed = { ...b, tokens: { access_token: 'b2', refresh_token: 'b2' } };
    writeFileSync(paths.authPath, JSON.stringify(refreshed));
    expect(start(paths, encodeSeed(b))).toMatchObject({ status: 'present' });
    expect(JSON.parse(readFileSync(paths.authPath, 'utf8'))).toEqual(refreshed);
  });

  it('replaces a changed seed in place and keeps a foreign credential', () => {
    const paths = home();
    const a = planAuth();
    const b = { ...planAuth(), tokens: { access_token: 'b', refresh_token: 'b' } };
    expect(start(paths, encodeSeed(a)).status).toBe('seeded');
    expect(start(paths, encodeSeed(b)).status).toBe('replaced');
    expect(JSON.parse(readFileSync(paths.authPath, 'utf8'))).toEqual(b);

    unlinkSync(paths.identityPath);
    expect(start(paths, encodeSeed(a))).toMatchObject({ status: 'present' });
    expect(JSON.parse(readFileSync(paths.authPath, 'utf8'))).toEqual(b);
  });
});
