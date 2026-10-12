import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildLoginArgs,
  CLOUD_CODEX_HOME,
  describeModelToPaste,
  describeSeedLifetime,
  login,
  selectClipboardCommand,
} from '../export-codex-seed.mjs';
import {
  CODEX_HOME,
  MODEL_ENVIRONMENT_KEY,
  SUBSCRIPTION_CREDENTIALS_STORE,
} from '../../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function jwt(exp) {
  return `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
}

describe('export-codex-seed', () => {
  // Sharing the working login's file would put the laptop and the cloud on one refresh chain.
  it('logs in under a home of its own', () => {
    expect(CLOUD_CODEX_HOME).not.toBe(CODEX_HOME);
  });

  // Codex reads CODEX_HOME's metadata before anything else and refuses a missing path, so a first
  // use on a machine with no ~/.codex-cloud would exit before the user could sign in.
  it('creates the dedicated home before the login that fills it', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-seed-home-'));
    roots.push(root);
    const home = join(root, 'nested', '.codex-cloud');
    let seenAtSpawn;
    login({
      env: { PATH: '/bin' },
      home,
      spawn: (command, args, options) => {
        seenAtSpawn = { command, args, exists: existsSync(home), home: options.env.CODEX_HOME };
        return { status: 0 };
      },
    });
    expect(seenAtSpawn).toEqual({
      command: 'codex',
      args: buildLoginArgs(),
      exists: true,
      home,
    });
    expect(() => login({ env: {}, home, spawn: () => ({ status: 1 }) })).toThrow(/exited 1/);
  });

  it('states the seed lifetime from the access token expiry', () => {
    const expiring = describeSeedLifetime({ tokens: { access_token: jwt(1_800_000_000) } });
    expect(expiring).toContain(new Date(1_800_000_000_000).toISOString());
    expect(expiring).toContain('rotates');
    const opaque = describeSeedLifetime({ tokens: { access_token: 'opaque' } });
    expect(opaque).toContain('no readable expiry');
    expect(describeSeedLifetime({ tokens: {} })).not.toContain('weekly');
  });

  it('pins the credential store the guard and the hook read', () => {
    expect(buildLoginArgs()).toEqual([
      'login',
      '-c',
      `cli_auth_credentials_store="${SUBSCRIPTION_CREDENTIALS_STORE}"`,
    ]);
  });

  it('picks the first clipboard tool present for the platform', () => {
    expect(selectClipboardCommand('darwin', () => true)).toEqual(['pbcopy']);
    expect(selectClipboardCommand('linux', (command) => command === 'xclip')).toEqual([
      'xclip',
      '-selection',
      'clipboard',
    ]);
    expect(selectClipboardCommand('linux', () => false)).toBeUndefined();
    expect(selectClipboardCommand('win32', () => true)).toBeUndefined();
  });

  it('names the model variable to paste beside the seed', () => {
    expect(
      describeModelToPaste('model = "gpt-5.6-sol"\n[profiles.x]\nmodel = "other"\n')
    ).toContain(`${MODEL_ENVIRONMENT_KEY}=gpt-5.6-sol`);
    const unconfigured = describeModelToPaste('');
    expect(unconfigured).toContain(MODEL_ENVIRONMENT_KEY);
    expect(unconfigured).toContain('--model');
  });
});
