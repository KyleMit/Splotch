// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AI_ACCESS_TOKEN_PARAM } from '../../../web/src/lib/inviteLink.ts';
import { INVITE_SAVE_FAILED_WARNING } from '../../../experiments/native-architecture/src/ai/inviteLink.ts';
import { createInviteCapture } from '../../../experiments/native-architecture/src/platform/inviteLinks.web.ts';
import { createProductOwnersLoader } from '../../../experiments/native-architecture/src/product/productOwnersLoader.web.ts';

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  history.replaceState(null, '', '/');
});

// The web export's wiring: the launch invite and the AI owners load the vault and the owners from
// one chunk, whose first request fails here.
function failingFirstChunk() {
  const writes = [];
  const chunk = {
    createProductOwners: () => ({}),
    aiVault: { write: vi.fn(async (kind, value) => void writes.push([kind, value])) },
  };
  const importChunk = vi
    .fn()
    .mockRejectedValueOnce(new Error('chunk request aborted'))
    .mockResolvedValue(chunk);
  const invite = createInviteCapture(() => importChunk().then((module) => module.aiVault));
  const owners = createProductOwnersLoader(importChunk, invite, async () => {});
  return { writes, importChunk, invite, owners };
}

it('saves and scrubs a launch invite before the recovered AI owner is handed out', async () => {
  history.replaceState({}, '', `/?${AI_ACCESS_TOKEN_PARAM}=sunny-meadow`);
  const { writes, invite, owners } = failingFirstChunk();

  await invite.settle();
  expect(writes).toEqual([]);
  expect(location.search).toContain(`${AI_ACCESS_TOKEN_PARAM}=sunny-meadow`);
  expect(warn).toHaveBeenCalledWith(INVITE_SAVE_FAILED_WARNING, expect.any(Error));

  const seenWhenHandedOut = await owners.load().then(() => ({
    writes: [...writes],
    search: location.search,
  }));

  expect(seenWhenHandedOut).toEqual({ writes: [['managed', 'sunny-meadow']], search: '' });
});

it('loads the owners without touching the vault when the launch carried no invite', async () => {
  history.replaceState({}, '', '/?other=1');
  const { writes, importChunk, invite, owners } = failingFirstChunk();

  await invite.settle();
  await expect(owners.load()).rejects.toThrow('chunk request aborted');
  await owners.load();

  expect(writes).toEqual([]);
  expect(importChunk).toHaveBeenCalledTimes(2);
  expect(location.search).toBe('?other=1');
});
