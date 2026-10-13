import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ACCESS_TOKEN_PARAM } from '../../../web/src/lib/inviteLink.ts';
import { AI_ORIGIN } from '../../../experiments/native-architecture/src/ai/contract.ts';
import { INVITE_SAVE_FAILED_WARNING } from '../../../experiments/native-architecture/src/ai/inviteLink.ts';

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
const { startInviteLinks } =
  await import('../../../experiments/native-architecture/src/platform/inviteLinks.ts');

const invite = (code) => `${AI_ORIGIN}/?${AI_ACCESS_TOKEN_PARAM}=${encodeURIComponent(code)}`;

function recordingVault() {
  const writes = [];
  return { writes, write: vi.fn(async (kind, value) => void writes.push([kind, value])) };
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

    await startInviteLinks({ write: vi.fn().mockRejectedValue(failure) });

    expect(warn).toHaveBeenCalledWith(INVITE_SAVE_FAILED_WARNING, failure);
  });
});
