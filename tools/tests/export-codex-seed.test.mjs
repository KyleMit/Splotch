import { describe, expect, it } from 'vitest';
import { buildLoginArgs, CLOUD_CODEX_HOME, selectClipboardCommand } from '../export-codex-seed.mjs';
import { decodeSeed, encodeSeed } from '../seed-codex-auth.mjs';
import {
  CODEX_HOME,
  SUBSCRIPTION_CREDENTIALS_STORE,
} from '../../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';

describe('export-codex-seed', () => {
  it('produces the form the cloud hook decodes', () => {
    const auth = { auth_mode: 'chatgpt', tokens: { access_token: 'a', refresh_token: 'r' } };
    expect(decodeSeed(encodeSeed(auth))).toEqual(auth);
    expect(encodeSeed(auth)).not.toContain('"');
  });

  // Sharing the working login's file would put the laptop and the cloud on one refresh chain.
  it('logs in under a home of its own', () => {
    expect(CLOUD_CODEX_HOME).not.toBe(CODEX_HOME);
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
});
