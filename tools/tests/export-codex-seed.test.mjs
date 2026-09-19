import { describe, expect, it } from 'vitest';
import {
  buildLoginArgs,
  CLOUD_CODEX_HOME,
  describeModelToPaste,
  selectClipboardCommand,
} from '../export-codex-seed.mjs';
import {
  CODEX_HOME,
  MODEL_ENVIRONMENT_KEY,
  SUBSCRIPTION_CREDENTIALS_STORE,
} from '../../.claude/skills/run-rival-agent/scripts/codex-subscription-auth.mjs';

describe('export-codex-seed', () => {
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

  it('names the model variable to paste beside the seed', () => {
    expect(
      describeModelToPaste('model = "gpt-5.6-sol"\n[profiles.x]\nmodel = "other"\n')
    ).toContain(`${MODEL_ENVIRONMENT_KEY}=gpt-5.6-sol`);
    const unconfigured = describeModelToPaste('');
    expect(unconfigured).toContain(MODEL_ENVIRONMENT_KEY);
    expect(unconfigured).toContain('--model');
  });
});
