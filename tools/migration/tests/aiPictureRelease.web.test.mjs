// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rgbaPng } from '../../tests/native-png-fixtures.mjs';

import { disk, model, resetAiDisk } from './aiStorageHarness.mjs';

import { createAiStorage } from '../../../experiments/native-architecture/src/platform/aiStorage.web.ts';
import { createNativeAi } from '../../../experiments/native-architecture/src/ai/generation.ts';

const PICTURES = 4;
const GRANT = '{"ok":true,"remaining":10,"limit":10}';
const picture = rgbaPng(2, 2, 255);

beforeEach(resetAiDisk);
const owners = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
});

function aiOwner({ onGenerate = () => {} } = {}) {
  let drawings = 0;
  const owner = createNativeAi({
    storage: createAiStorage(),
    vault: {
      installationId: async () => 'a'.repeat(64),
      read: async () => null,
      write: async () => {},
      remove: async () => {},
    },
    admit: async () => {},
    prepare: async () => {
      drawings += 1;
      return {
        bytes: new Uint8Array(rgbaPng(2, 2, 255)),
        originalId: `picture-${drawings}-fixture`,
        originalModel: model,
      };
    },
    transport: async (request) => {
      if (request.path === '/api/free-generation-grant') return new Response(GRANT);
      onGenerate();
      return new Response(picture, { headers: { 'Content-Type': 'image/png' } });
    },
  });
  owners.push(owner);
  return owner;
}

const storedBytes = () => (disk.raw === undefined ? 0 : JSON.stringify(disk.raw).length);
const storedRuns = () => disk.raw?.attempts.length ?? 0;

async function sendPicture(owner) {
  owner.open();
  const { x, y } = owner.getState().gate;
  owner.gateInput(String(x * y));
  owner.gateAnswer();
  await vi.waitFor(() => expect(owner.getState().authorized).toBe(true));
  await vi.waitFor(() => expect(owner.getState().busy).toBe(false));
  await owner.generate();
}

async function makePicture(owner) {
  await sendPicture(owner);
  expect(owner.getState().journal).toMatchObject({ phase: 'result' });
}

it('releases each closed picture, so many pictures leave no stored bytes behind', async () => {
  const owner = aiOwner();
  let largest = 0;
  for (let made = 0; made < PICTURES; made += 1) {
    await makePicture(owner);
    expect(storedRuns()).toBe(1);
    largest = Math.max(largest, storedBytes());
    owner.dismiss();
    expect(owner.getState().open).toBe(false);
    await vi.waitFor(() => expect(storedRuns()).toBe(0));
  }
  expect(storedBytes()).toBeLessThan(largest / 10);
  expect(await createAiStorage().read()).toBeNull();
});

it('keeps a picture still on screen for a relaunch to read', async () => {
  const owner = aiOwner();
  await makePicture(owner);
  const shown = owner.getState().journal;
  const relaunched = createAiStorage();
  expect((await relaunched.read()).receipt.journal).toEqual(shown);
  expect(await relaunched.pictures()).toEqual([shown.result]);
});

it('releases a picture that lands after its card was closed', async () => {
  const owner = aiOwner({ onGenerate: () => owner.close() });
  await makePicture(owner);
  expect(owner.getState().open).toBe(false);
  await vi.waitFor(() => expect(storedRuns()).toBe(0));
});

it('releases a retained picture whose finishing journal write failed', async () => {
  const owner = aiOwner();
  const FINISHING_WRITE_REVISION = 3;
  disk.failRevision = FINISHING_WRITE_REVISION;
  await sendPicture(owner);
  disk.failRevision = null;
  expect(owner.getState().journal.phase).not.toBe('result');
  expect(owner.getState().heldResult).not.toBeNull();
  expect(disk.raw.attempts[0].receipt.journal.phase).toBe('result');
  owner.dismiss();
  await vi.waitFor(() => expect(storedRuns()).toBe(0));
});

it('closes the card when a release fails, and the next picture still starts', async () => {
  const owner = aiOwner();
  await makePicture(owner);
  disk.abort = true;
  owner.dismiss();
  expect(owner.getState().open).toBe(false);
  await vi.waitFor(() => expect(disk.abort).toBe(false));
  expect(storedRuns()).toBe(1);
  await makePicture(owner);
  expect(owner.getState().message).toBe(
    'Your AI picture and original drawing are saved on this device.'
  );
  owner.dismiss();
  await vi.waitFor(() => expect(storedRuns()).toBe(0));
});
