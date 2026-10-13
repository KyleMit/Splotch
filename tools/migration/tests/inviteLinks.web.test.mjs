// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ACCESS_TOKEN_PARAM } from '../../../web/src/lib/inviteLink.ts';
import {
  AI_ORIGIN,
  MAX_CREDENTIAL_CHARACTERS,
} from '../../../experiments/native-architecture/src/ai/contract.ts';
import { withCredentialLeases } from '../../../experiments/native-architecture/src/ai/credentialLease.ts';
import {
  INVITE_SAVE_FAILED_WARNING,
  inviteAccessCode,
  nativeInviteAccessCode,
} from '../../../experiments/native-architecture/src/ai/inviteLink.ts';
import { createInviteCapture } from '../../../experiments/native-architecture/src/platform/inviteLinks.web.ts';

const startInviteLinks = (loadVault) => createInviteCapture(loadVault).settle();
import { browserHistoryPort } from '../../../experiments/native-architecture/src/platform/BrowserBack.web.tsx';
import {
  BROWSER_BACK_STATE_KEY,
  createBrowserBack,
} from '../../../experiments/native-architecture/src/product/browserBack.ts';

const repoRoot = join(import.meta.dirname, '../../..');
const ROUTER_STATE = { router: { index: 3 } };

function invitePath(code, extra = '') {
  return `/?${AI_ACCESS_TOKEN_PARAM}=${encodeURIComponent(code)}${extra}`;
}

function recordingVault() {
  const writes = [];
  return { writes, write: vi.fn(async (kind, value) => void writes.push([kind, value])) };
}

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  history.replaceState(null, '', '/');
});

describe('invite access code parsing', () => {
  it.each([
    ['plain code', 'sunny-meadow', 'sunny-meadow'],
    ['absent parameter', null, null],
    ['empty code', '', null],
    ['inner space', 'a b', null],
    ['surrounding space', ' code ', null],
    ['control character', 'co\u0007de', null],
    ['longest code', 'c'.repeat(MAX_CREDENTIAL_CHARACTERS), 'c'.repeat(MAX_CREDENTIAL_CHARACTERS)],
    ['overlong code', 'c'.repeat(MAX_CREDENTIAL_CHARACTERS + 1), null],
  ])('reads a %s with the vault credential rule', (_name, code, expected) => {
    const query = new URLSearchParams(
      code === null ? 'other=1' : { [AI_ACCESS_TOKEN_PARAM]: code }
    );
    expect(inviteAccessCode(query)).toBe(expected);
  });

  it.each([
    ['the issued invite', `${AI_ORIGIN}${invitePath('sunny-meadow')}`, 'sunny-meadow'],
    ['an encoded invite', `${AI_ORIGIN}${invitePath('a&b=c')}`, 'a&b=c'],
    ['an invite with a fragment', `${AI_ORIGIN}${invitePath('code')}#top`, 'code'],
    ['an invite among other parameters', `${AI_ORIGIN}/?x=1&${AI_ACCESS_TOKEN_PARAM}=code`, 'code'],
    ['a lookalike host', `${AI_ORIGIN}.evil.example${invitePath('code')}`, null],
    ['a userinfo host', `${AI_ORIGIN}@evil.example${invitePath('code')}`, null],
    ['another path', `${AI_ORIGIN}/admin?${AI_ACCESS_TOKEN_PARAM}=code`, null],
    ['plain http', `${AI_ORIGIN.replace('https:', 'http:')}${invitePath('code')}`, null],
    ['a custom scheme', `splotch://${invitePath('code')}`, null],
    ['an invalid code', `${AI_ORIGIN}${invitePath('a b')}`, null],
  ])('accepts only Splotch-issued native links: %s', (_name, link, expected) => {
    expect(nativeInviteAccessCode(link)).toBe(expected);
  });
  it('rejects a link whose query the runtime cannot decode', () => {
    // React Native's URLSearchParams polyfill throws URIError on a malformed escape.
    vi.stubGlobal(
      'URLSearchParams',
      class {
        constructor() {
          throw new URIError('URI malformed');
        }
      }
    );
    try {
      expect(nativeInviteAccessCode(`${AI_ORIGIN}/?${AI_ACCESS_TOKEN_PARAM}=%E0%A4%A`)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('web launch invite capture', () => {
  it('saves the code to the access-code slot, then scrubs only its parameter', async () => {
    history.replaceState(ROUTER_STATE, '', invitePath('invitation-code', '&other=1'));
    const vault = recordingVault();

    await startInviteLinks(async () => vault);

    expect(vault.writes).toEqual([['managed', 'invitation-code']]);
    expect(location.search).toBe('?other=1');
    expect(history.state).toEqual(ROUTER_STATE);
  });

  it('keeps the parameter when secure persistence fails', async () => {
    history.replaceState({}, '', invitePath('retry-code'));
    const failure = new Error('secure storage unavailable');
    const vault = { write: vi.fn().mockRejectedValue(failure) };

    await startInviteLinks(async () => vault);

    expect(location.search).toContain(`${AI_ACCESS_TOKEN_PARAM}=retry-code`);
    expect(warn).toHaveBeenCalledWith(INVITE_SAVE_FAILED_WARNING, failure);
  });

  it('keeps the parameter when a newer credential write supersedes it', async () => {
    let finishInvite;
    const vault = withCredentialLeases({
      write: () =>
        new Promise((resolve) => {
          if (finishInvite) resolve();
          else finishInvite = resolve;
        }),
    });
    history.replaceState({}, '', invitePath('invitation-code'));

    const capturing = startInviteLinks(async () => vault);
    // The vault arrives in a chunk; the invite's write starts once it has.
    await new Promise((resolve) => setTimeout(resolve));
    const newer = vault.write('managed', 'newer-code');
    finishInvite();
    await capturing;
    await newer;

    expect(location.search).toContain(`${AI_ACCESS_TOKEN_PARAM}=invitation-code`);
    expect(warn).toHaveBeenCalledWith(INVITE_SAVE_FAILED_WARNING, expect.any(Error));
  });

  it.each([
    ['absent', '/?other=1'],
    ['invalid', invitePath('a b')],
  ])('leaves the URL alone and never loads the vault when the code is %s', async (_name, path) => {
    history.replaceState({}, '', path);
    const before = location.href;
    const loadVault = vi.fn(async () => recordingVault());

    await startInviteLinks(loadVault);

    expect(loadVault).not.toHaveBeenCalled();
    expect(location.href).toBe(before);
  });

  it('holds every settle() until an in-flight invite write lands', async () => {
    history.replaceState({}, '', invitePath('held-code'));
    let finishWrite;
    const vault = {
      write: vi.fn(
        () =>
          new Promise((resolve) => {
            finishWrite = resolve;
          })
      ),
    };
    const capture = createInviteCapture(async () => vault);

    const launch = capture.settle();
    await vi.waitFor(() => expect(vault.write).toHaveBeenCalledOnce());
    let ownerSettled = false;
    const owner = capture.settle().then(() => {
      ownerSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve));
    expect(ownerSettled).toBe(false);

    finishWrite();
    await owner;
    await launch;
    expect(location.search).toBe('');
    expect(vault.write).toHaveBeenCalledOnce();
  });

  it('retries a capture whose vault chunk failed to load, then saves and scrubs', async () => {
    history.replaceState({}, '', invitePath('offline-code'));
    const failure = new Error('chunk unavailable');
    const vault = recordingVault();
    const loadVault = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(vault);
    const capture = createInviteCapture(loadVault);

    await capture.settle();
    expect(location.search).toContain(`${AI_ACCESS_TOKEN_PARAM}=offline-code`);
    expect(warn).toHaveBeenCalledWith(INVITE_SAVE_FAILED_WARNING, failure);

    await capture.settle();
    expect(vault.writes).toEqual([['managed', 'offline-code']]);
    expect(location.search).toBe('');
    await capture.settle();
    expect(loadVault).toHaveBeenCalledTimes(2);
  });

  it('keeps browser Back attached across the scrub', async () => {
    history.replaceState({}, '', invitePath('invitation-code'));
    const options = { owner: 'fixture', runtime: 'fixture', guardEligible: true };
    const back = createBrowserBack(browserHistoryPort(), options);
    back.start();

    await startInviteLinks(async () => recordingVault());
    back.setDrawingInk(true);

    expect(location.search).toBe('');
    expect(history.state[BROWSER_BACK_STATE_KEY].layers).toEqual(['guard']);
    back.stop();
  });

  it('detaches browser Back on the scrub when the port reads the raw URL', async () => {
    history.replaceState({}, '', invitePath('invitation-code'));
    const options = { owner: 'fixture', runtime: 'fixture', guardEligible: true };
    const rawPort = { ...browserHistoryPort(), url: () => location.href };
    const back = createBrowserBack(rawPort, options);
    back.start();

    await startInviteLinks(async () => recordingVault());
    back.setDrawingInk(true);

    expect(history.state[BROWSER_BACK_STATE_KEY].layers).toEqual([]);
  });

  it('warns with the shipping page warning text', () => {
    const page = readFileSync(join(repoRoot, 'web/src/routes/+page.svelte'), 'utf8');
    expect(page).toContain(`console.warn('${INVITE_SAVE_FAILED_WARNING}', err)`);
    expect(page).toContain('captureAiAccessTokenFromUrl()');
  });
});
