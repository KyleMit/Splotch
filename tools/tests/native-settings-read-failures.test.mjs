import { describe, expect, it, vi } from 'vitest';
import { createDrawingProduct } from '../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import {
  createSoundSettings,
  MAX_SETTINGS_BYTES,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';

// Stored settings that cannot be used fail one of three ways, and each says only what can help:
// a store that did not answer may answer a second read; a damaged record, or one a newer build
// wrote, stays as it is however often it is read, so neither offers a retry, and neither is ever
// written over.
const NEWER =
  'A newer version of Splotch saved these settings. Update Splotch to use them. Sound is off, protection stays active, and your choices work for this session.';
const MALFORMED =
  'Saved drawing settings are damaged. Sound is off, protection stays active, and your choices work for this session.';
const UNAVAILABLE =
  'Drawing settings could not be read. Sound is off. Your choices work for this session. Choose your settings and retry saving.';
const STILL_UNAVAILABLE =
  'Settings still could not be read. AI stays off and protection stays active.';
const ALWAYS = {
  ai: 'always',
  imageReport: 'always',
  externalLinks: 'always',
  feedback: 'always',
  parentCenter: 'always',
};
const NEVER = Object.fromEntries(Object.keys(ALWAYS).map((feature) => [feature, 'never']));

function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
}

// The record this build writes.
async function currentRecord() {
  const storage = { read: async () => null, write: vi.fn(async () => {}) };
  const settings = createSoundSettings(storage, () => {});
  await settings.load();
  await settings.setEnabled(true);
  return JSON.parse(storage.write.mock.calls.at(-1)[0]);
}

// What the next build might write: its version first, a preference this build has never seen, and
// every protection turned off, which this build must not adopt.
async function newerRecord(padding = 0) {
  const current = await currentRecord();
  return JSON.stringify({
    ...current,
    version: current.version + 1,
    aiEnabled: true,
    parentPolicies: NEVER,
    futurePreference: 'x'.repeat(padding),
  });
}

function product(read) {
  const storage = { read: vi.fn(read), write: vi.fn(async () => {}) };
  const owner = createDrawingProduct(storage, () => {});
  return { owner, storage };
}

// Every way a parent or the app could try to write while the record is unread.
async function tryEveryWrite(owner) {
  owner.openParentCenter();
  solve(owner.gate);
  await owner.setAiEnabled(true);
  await owner.setPolicy('parentCenter', 'never', true);
  await owner.settings.setEnabled(true);
  await owner.settings.setAppearance('dark');
  await owner.settings.markWhatsNewSeen();
  await owner.settings.retrySave();
  await owner.settings.retryParentSave();
}

describe('stored settings this build cannot use', () => {
  // Negative control: classifying every refused record as damaged fails the message here.
  it.each([
    ['a newer record', 0],
    ["a newer record past this build's size cap", MAX_SETTINGS_BYTES],
  ])('keep %s untouched under protection and ask for an update', async (_, padding) => {
    const record = await newerRecord(padding);
    const { owner, storage } = product(async () => record);
    await owner.settings.load();
    expect(owner.getState().settings).toMatchObject({
      status: 'ready',
      saved: false,
      soundEnabled: false,
      aiEnabled: false,
      parentPolicies: ALWAYS,
      message: NEWER,
    });
    expect(owner.settings.retryCanRecover()).toBe(false);
    expect(owner.settings.canEditParent()).toBe(false);

    await tryEveryWrite(owner);
    await owner.settings.retryRead();
    expect(storage.write).not.toHaveBeenCalled();
    expect(owner.getState().settings).toMatchObject({
      aiEnabled: false,
      parentPolicies: ALWAYS,
      soundEnabled: true,
      appearance: 'dark',
      message: NEWER,
    });
    owner.dispose();
  });

  // Negative control: classifying every refused record as newer fails the message here. A record
  // whose version is not its leading integer is not one any build writes.
  it.each([
    'not JSON',
    '{"version":16,"soundEnabled":"true"}',
    '{"version":"17","soundEnabled":true}',
    '{"soundEnabled":true,"version":17}',
    '{"version":0,"soundEnabled":true}',
  ])('keep the damaged record %s untouched under protection, offering no retry', async (record) => {
    const { owner, storage } = product(async () => record);
    await owner.settings.load();
    expect(owner.getState().settings).toMatchObject({
      saved: false,
      soundEnabled: false,
      aiEnabled: false,
      parentPolicies: ALWAYS,
      message: MALFORMED,
    });
    expect(owner.settings.retryCanRecover()).toBe(false);

    await tryEveryWrite(owner);
    await owner.settings.retryRead();
    expect(storage.write).not.toHaveBeenCalled();
    expect(owner.getState().settings.message).toBe(MALFORMED);
    owner.dispose();
  });
});

describe('a store that does not answer', () => {
  // Negative control: classifying a refused read by the record (as damaged) fails here, since a
  // store that answers later then has no retry to answer.
  it('offers a second read, which recovers once the store answers', async () => {
    const record = JSON.stringify(await currentRecord());
    const answers = [new Error('permission denied'), new Error('permission denied'), record];
    const { owner, storage } = product(async () => {
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    });
    await owner.settings.load();
    expect(owner.getState().settings).toMatchObject({
      saved: false,
      soundEnabled: false,
      parentPolicies: ALWAYS,
      message: UNAVAILABLE,
    });
    expect(owner.settings.retryCanRecover()).toBe(true);

    await tryEveryWrite(owner);
    expect(storage.write).not.toHaveBeenCalled();
    await owner.settings.retryRead();
    expect(owner.getState().settings.message).toBe(STILL_UNAVAILABLE);
    expect(owner.settings.retryCanRecover()).toBe(true);

    await owner.settings.retryRead();
    expect(owner.getState().settings).toMatchObject({
      saved: true,
      soundEnabled: true,
      message: '',
    });
    expect(owner.settings.canEditParent()).toBe(true);
    await owner.settings.setEnabled(false);
    expect(storage.write).toHaveBeenCalledOnce();
    owner.dispose();
  });

  it('stops offering a retry once a second read finds a newer record', async () => {
    const record = await newerRecord();
    const answers = [new Error('permission denied'), record];
    const { owner, storage } = product(async () => {
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    });
    await owner.settings.load();
    expect(owner.settings.retryCanRecover()).toBe(true);
    await owner.settings.retryRead();
    expect(owner.getState().settings).toMatchObject({ parentPolicies: ALWAYS, message: NEWER });
    expect(owner.settings.retryCanRecover()).toBe(false);
    expect(storage.write).not.toHaveBeenCalled();
    owner.dispose();
  });
});
