// @vitest-environment node
import { beforeEach, expect, it } from 'vitest';
import { rgbaPng } from '../../tests/native-png-fixtures.mjs';

import { disk, model, png, journal, resetAiDisk } from './aiStorageHarness.mjs';

import { createAiStorage } from '../../../experiments/native-architecture/src/platform/aiStorage.web.ts';
import {
  AI_STORAGE_DATABASE,
  MAX_AI_STORAGE_ATTEMPTS,
  MAX_AI_STORAGE_BYTES,
  checkAiStorageCapacity,
} from '../../../experiments/native-architecture/src/platform/aiStorageRecords.web.ts';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { JOB_TTL_MS } from '../../../experiments/native-architecture/src/ai/contract.ts';

beforeEach(resetAiDisk);

it('restarts with exact original UTF8 model and pinned upload in the isolated database', async () => {
  const first = createAiStorage();
  const receipt = await first.prepare(journal(), model, png);
  const original = disk.raw.attempts[0].originalModel;
  const restarted = createAiStorage();
  const stored = await restarted.read();
  expect(original).toBe(model);
  expect(new TextEncoder().encode(original)).toEqual(new TextEncoder().encode(model));
  expect(stored.receipt).toEqual(receipt);
  expect(await restarted.readPreparedUpload(stored.receipt)).toEqual(png);
  expect(disk.opened.every(([name]) => name === AI_STORAGE_DATABASE)).toBe(true);
});

it('waits for transaction completion and does not expose an aborted preparation', async () => {
  const storage = createAiStorage();
  disk.abort = true;
  await expect(storage.prepare(journal(), model, png)).rejects.toThrow('transaction abort');
  expect(disk.raw).toBeUndefined();
  await expect(storage.prepare(journal(), model, png)).rejects.toThrow('Reopen');
  expect(await storage.read()).toBeNull();
});

it.each(['upload', 'originalModel'])(
  'fails closed when committed %s bytes change',
  async (field) => {
    await createAiStorage().prepare(journal(), model, png);
    disk.raw.attempts[0][field] =
      field === 'upload'
        ? Buffer.from(rgbaPng(2, 2, 0)).toString('base64')
        : JSON.stringify(emptyDrawing());
    await expect(createAiStorage().read()).rejects.toThrow();
  }
);

it('rejects copied and stale prepared receipt objects', async () => {
  const storage = createAiStorage();
  const receipt = await storage.prepare(journal(), model, png);
  await expect(storage.readPreparedUpload({ ...receipt })).rejects.toThrow();
  const stored = await storage.read();
  await storage.write({ ...stored.receipt.journal, phase: 'unknown' });
  await expect(storage.readPreparedUpload(stored.receipt)).rejects.toThrow();
});

it('rejects a competing tab update inside the transaction CAS', async () => {
  const a = createAiStorage(),
    b = createAiStorage();
  await a.prepare(journal(), model, png);
  await b.read();
  const results = await Promise.allSettled([
    a.write(journal(1, 'unknown')),
    b.write(journal(1, 'failed')),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(disk.raw.revision).toBe(2);
});

it('retains gallery bytes and result journal atomically and survives restart', async () => {
  const storage = createAiStorage();
  await storage.prepare(journal(), model, png);
  disk.abort = true;
  await expect(storage.retain(1, png, 'image/png')).rejects.toThrow();
  expect(disk.raw.attempts[0].receipt.journal.phase).toBe('sent');
  expect(await storage.pictures()).toEqual([]);
  await storage.read();
  const retained = await storage.retain(1, png, 'image/png');
  expect(retained.picture.uri).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
  expect(await createAiStorage().pictures()).toEqual([retained.picture]);
});

it('requires reread after uncertain commit and never rolls a completed result back', async () => {
  const storage = createAiStorage();
  await storage.prepare(journal(), model, png);
  disk.uncertain = true;
  await expect(storage.retain(1, png, 'image/png')).rejects.toThrow('unconfirmed');
  await expect(storage.write(journal(1, 'unknown'))).rejects.toThrow();
  expect((await storage.read()).receipt.journal.phase).toBe('result');
  await expect(storage.write(journal(1, 'unknown'))).rejects.toThrow();
  expect(disk.raw.attempts[0].receipt.journal.phase).toBe('result');
});

it('rejects result replacement and changed retained bytes', async () => {
  const storage = createAiStorage();
  await storage.prepare(journal(), model, png);
  await storage.retain(1, png, 'image/png');
  await expect(storage.retain(1, new Uint8Array(rgbaPng(2, 2, 0)), 'image/png')).rejects.toThrow();
  disk.raw.attempts[0].receipt.journal.result.uri = `data:image/png;base64,${rgbaPng(2, 2, 0).toString('base64')}`;
  await expect(createAiStorage().pictures()).rejects.toThrow();
});

it('confirms an identical retained result after an uncertain save without rewriting or replacing it', async () => {
  const storage = createAiStorage();
  await storage.prepare(journal(), model, png);
  disk.uncertain = true;
  await expect(storage.retain(1, png, 'image/png')).rejects.toThrow('unconfirmed');
  await storage.read();
  const revision = disk.raw.revision;
  const retained = await storage.retain(1, png, 'image/png');
  expect(retained.picture).toEqual(disk.raw.attempts[0].receipt.journal.result);
  expect(disk.raw.revision).toBe(revision);
});

it('drops the earlier finished attempt when a new one is prepared, so its late result has no home', async () => {
  const storage = createAiStorage();
  await storage.prepare(journal(), model, png);
  await storage.write(journal(1, 'failed'));
  const next = await storage.prepare(journal(2), model, png);
  await expect(storage.retain(1, png, 'image/png')).rejects.toThrow();
  expect((await createAiStorage().read()).receipt).toEqual(next);
  expect(await createAiStorage().pictures()).toEqual([]);
  expect(disk.raw.attempts.map(({ receipt }) => receipt.journal.id)).toEqual([2]);
});

it('lets a tab that last saw an attempt unfinished read the newer run that replaced it', async () => {
  const stale = createAiStorage();
  await stale.prepare(journal(), model, png);
  const other = createAiStorage();
  await other.read();
  await other.write(journal(1, 'failed'));
  await other.prepare(journal(2), model, png);
  expect((await stale.read()).receipt.journal.id).toBe(2);
});

it('fails closed when the newest entry is malformed', async () => {
  const storage = createAiStorage();
  await storage.prepare(journal(), model, png);
  await storage.write(journal(1, 'failed'));
  await storage.prepare(journal(2), model, png);
  disk.raw.attempts.at(-1).receipt.journal.phase = 'invented';
  await expect(createAiStorage().read()).rejects.toThrow();
});

it('refuses new attempts while unresolved and requires monotonic IDs', async () => {
  const storage = createAiStorage();
  await storage.prepare(journal(), model, png);
  await expect(storage.prepare(journal(2), model, png)).rejects.toThrow();
  await storage.read();
  await storage.write(journal(1, 'failed'));
  await expect(storage.prepare(journal(1), model, png)).rejects.toThrow();
});

it('keeps making pictures past the attempt cap, holding only the latest one, as shipping does', async () => {
  const storage = createAiStorage();
  const runs = MAX_AI_STORAGE_ATTEMPTS * 2;
  for (let id = 1; id <= runs; id++) {
    await storage.prepare(journal(id), model, png);
    await storage.retain(id, png, 'image/png');
  }
  expect(disk.raw.attempts.map(({ receipt }) => receipt.journal.id)).toEqual([runs]);
  expect(await createAiStorage().pictures()).toHaveLength(1);
});

it('charges durable base64/data URI UTF16 copies against the byte limit', () => {
  const fixture = {
    originalModel: { length: MAX_AI_STORAGE_BYTES / 2 },
    originalLength: 1,
    upload: '',
    receipt: { inputLength: 1, journal: { result: null } },
  };
  expect(() => checkAiStorageCapacity({ attempts: [fixture] })).toThrow('storage is full');
});

it('pins held credential references, commits intent and records only stable server expiry', async () => {
  const storage = createAiStorage();
  const credential = { kind: 'free', reference: 'a'.repeat(64) };
  const receipt = await storage.prepareRecovery(journal(1, 'unknown'), model, png, credential);
  await expect(storage.commitRecoveryIntent({ ...receipt })).rejects.toThrow();
  const loaded = await storage.read();
  const committed = await storage.commitRecoveryIntent(loaded.receipt);
  const status = {
    kind: 'status',
    id: committed.recovery.id,
    expiresAt: 1000 + JOB_TTL_MS,
    phase: 'pending',
    pollAfterMs: 4000,
  };
  const admitted = await storage.recordRecoveryStatus(committed, status);
  expect(admitted.recovery).toMatchObject({
    credential,
    intent: 'committed',
    expiry: { kind: 'known', expiresAt: status.expiresAt },
  });
  await expect(
    storage.recordRecoveryStatus(admitted, { ...status, expiresAt: status.expiresAt + 1 })
  ).rejects.toThrow();
  expect((await createAiStorage().read()).receipt.recovery.expiry.expiresAt).toBe(status.expiresAt);
});
