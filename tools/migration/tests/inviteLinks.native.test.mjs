import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ACCESS_TOKEN_PARAM } from '../../../src/lib/inviteLink.ts';
import { AI_ORIGIN } from '../../../src/ai/contract.ts';
import { withCredentialLeases } from '../../../src/ai/credentialLease.ts';
import { INVITE_SAVE_FAILED_WARNING } from '../../../src/ai/inviteLink.ts';

const linking = vi.hoisted(() => ({
  listeners: [],
  initial: Promise.resolve(null),
}));
vi.mock('react-native', () => ({
  Linking: {
    addEventListener: (type, listener) => {
      linking.listeners.push([type, listener]);
      return { remove: () => {} };
    },
    getInitialURL: () => linking.initial,
  },
}));
const { startInviteLinks } = await import('../../../src/platform/inviteLinks.ts');

const invite = (code) => `${AI_ORIGIN}/?${AI_ACCESS_TOKEN_PARAM}=${encodeURIComponent(code)}`;

function recordingVault() {
  const writes = [];
  const leased = withCredentialLeases({
    write: async (kind, value) => void writes.push([kind, value]),
  });
  return { writes, lease: leased.lease, write: vi.fn(leased.write) };
}

function heldLaunchUrl() {
  let resolve;
  linking.initial = new Promise((settle) => (resolve = settle));
  return resolve;
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

async function emitUrl(url) {
  for (const [type, listener] of linking.listeners) if (type === 'url') listener({ url });
  await settle();
}

let warn;
beforeEach(() => {
  linking.listeners.length = 0;
  linking.initial = Promise.resolve(null);
  warn?.mockRestore();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('native invite links', () => {
  it('saves the access code from the link that launched the app', async () => {
    linking.initial = Promise.resolve(invite('launch-code'));
    const vault = recordingVault();

    await startInviteLinks(vault);

    expect(vault.writes).toEqual([['managed', 'launch-code']]);
  });

  it('saves the access code from a link opened while the app runs', async () => {
    const vault = recordingVault();
    await startInviteLinks(vault);

    await emitUrl(invite('running-code'));

    expect(vault.writes).toEqual([['managed', 'running-code']]);
  });

  it('ignores launch and runtime links that are not Splotch invites', async () => {
    linking.initial = Promise.resolve(`https://evil.example/?${AI_ACCESS_TOKEN_PARAM}=x`);
    const vault = recordingVault();
    await startInviteLinks(vault);

    await emitUrl(`${AI_ORIGIN}/?other=1`);
    await emitUrl(invite('has space'));

    expect(vault.write).not.toHaveBeenCalled();
  });

  it('still handles runtime links when the launch link cannot be read', async () => {
    const failure = new Error('no initial URL');
    linking.initial = Promise.reject(failure);
    const vault = recordingVault();

    await startInviteLinks(vault);
    await emitUrl(invite('later-code'));

    expect(warn).toHaveBeenCalledWith(INVITE_SAVE_FAILED_WARNING, failure);
    expect(vault.writes).toEqual([['managed', 'later-code']]);
  });

  it('warns when secure persistence fails', async () => {
    const failure = new Error('secure storage unavailable');
    linking.initial = Promise.resolve(invite('launch-code'));

    await startInviteLinks({
      lease: () => ({ valid: () => true }),
      write: vi.fn().mockRejectedValue(failure),
    });

    expect(warn).toHaveBeenCalledWith(INVITE_SAVE_FAILED_WARNING, failure);
  });

  it('drops a launch invite that resolves after a runtime invite was saved', async () => {
    const resolveLaunch = heldLaunchUrl();
    const vault = recordingVault();
    const starting = startInviteLinks(vault);

    await emitUrl(invite('runtime-code'));
    resolveLaunch(invite('launch-code'));
    await starting;

    expect(vault.writes).toEqual([['managed', 'runtime-code']]);
  });

  it('drops a launch invite that resolves after a typed code was saved', async () => {
    const resolveLaunch = heldLaunchUrl();
    const vault = recordingVault();
    const starting = startInviteLinks(vault);

    await vault.write('managed', 'typed-code');
    resolveLaunch(invite('launch-code'));
    await starting;

    expect(vault.writes).toEqual([['managed', 'typed-code']]);
  });
});
