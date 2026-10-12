// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { disk, model, png, journal, resetAiDisk } from './aiStorageHarness.mjs';
import { createAiStorage } from '../../../experiments/native-architecture/src/platform/aiStorage.web';
import { JOB_TTL_MS } from '../../../experiments/native-architecture/src/ai/contract';

beforeEach(resetAiDisk);

const recoveryCredential = { kind: 'free', reference: 'a'.repeat(64) };
async function preparedRecovery(storage = createAiStorage()) {
  const source = await storage.prepareRecovery(
    journal(1, 'unknown'),
    model,
    png,
    recoveryCredential
  );
  const receipt = await storage.prepareRecoverySendFromHeld(source, 2, 2000, recoveryCredential);
  return { storage, source, receipt };
}
const admittedStatus = (receipt) => ({
  kind: 'status',
  id: receipt.recovery.id,
  expiresAt: receipt.journal.createdAt + JOB_TTL_MS,
  phase: 'pending',
  pollAfterMs: 4000,
});
const deliveryFor = (receipt) => ({
  expiresAt: receipt.journal.createdAt + JOB_TTL_MS,
  digest: createHash('sha256').update(png).digest('hex'),
  receipt: 'b'.repeat(64),
  mime: 'image/png',
  length: png.length,
});
async function retainedRecovery() {
  const f = await preparedRecovery();
  const marked = await f.storage.markRecoverySubmission(f.receipt);
  const retained = await f.storage.retainRecoveryResult(marked, deliveryFor(marked), png);
  return { ...f, retained };
}
const ackFor = (receipt) => ({
  status: 200,
  body: {
    ok: true,
    protocol: 'splotch-ai-recovery-v1',
    id: receipt.recovery.id,
    phase: 'acknowledged',
    expiresAt: receipt.recovery.delivery.expiresAt,
    deliveryDigest: receipt.recovery.delivery.digest,
    deliveryReceipt: receipt.recovery.delivery.receipt,
  },
});

it('copies verified held bytes to a fresh derived identity and keeps the old random recovery id readable', async () => {
  const { storage, source, receipt } = await preparedRecovery();
  expect(receipt.nonce).not.toBe(source.nonce);
  expect(receipt.recovery.id).toBe(
    createHash('sha256')
      .update(JSON.stringify(['splotch-ai-recovery-v1', receipt.nonce, 2000]))
      .digest('hex')
  );
  expect(disk.raw.attempts[0].receipt).toEqual(source);
  expect(disk.raw.attempts[1].originalModel).toBe(disk.raw.attempts[0].originalModel);
  expect(disk.raw.attempts[1].upload).toBe(disk.raw.attempts[0].upload);
  expect(await storage.readRecoveryAttempt(1)).toEqual(source);
  expect((await storage.read()).kind).toBe('recovery-request');
});

it('requires the submission marker and refuses upload after admission', async () => {
  const { storage, receipt } = await preparedRecovery();
  await expect(storage.readRecoveryUpload(receipt)).rejects.toThrow();
  const current = await storage.readRecoveryAttempt(2);
  const marked = await storage.markRecoverySubmission(current);
  expect(await storage.readRecoveryUpload(marked)).toEqual(png);
  const admitted = await storage.recordRecoveryAdmission(marked, admittedStatus(marked));
  await expect(storage.readRecoveryUpload(admitted)).rejects.toThrow();
  expect(disk.raw.attempts[1].receipt.recovery.state).toBe('admitted');
});

it('requires an authoritative reread after an uncertain marker and preserves that marker', async () => {
  const { storage, receipt } = await preparedRecovery();
  disk.uncertain = true;
  await expect(storage.markRecoverySubmission(receipt)).rejects.toThrow('unconfirmed');
  await expect(storage.readRecoveryUpload(receipt)).rejects.toThrow();
  const confirmed = await storage.readRecoveryAttempt(2);
  expect(confirmed.recovery.state).toBe('submission-uncertain');
  expect(await storage.readRecoveryUpload(confirmed)).toEqual(png);
  expect(disk.raw.attempts).toHaveLength(2);
});

it('rejects another active request and stale or copied source receipts', async () => {
  const { storage, source } = await preparedRecovery();
  await expect(
    storage.prepareRecoverySendFromHeld(source, 3, 3000, recoveryCredential)
  ).rejects.toThrow();
  const current = await storage.readRecoveryAttempt(1);
  await expect(
    storage.prepareRecoverySendFromHeld({ ...current }, 3, 3000, recoveryCredential)
  ).rejects.toThrow();
  expect(disk.raw.attempts).toHaveLength(2);
});

it('durably pins the tuple before a result write and resumes only the identical delivery', async () => {
  const { storage, receipt } = await preparedRecovery();
  const marked = await storage.markRecoverySubmission(receipt);
  const delivery = deliveryFor(marked);
  disk.failRevision = disk.raw.revision + 2;
  await expect(storage.retainRecoveryResult(marked, delivery, png)).rejects.toThrow(
    'transaction abort'
  );
  expect(disk.raw.attempts[1].receipt.recovery.state).toBe('delivery-pinned');
  expect(disk.raw.attempts[1].receipt.journal.result).toBeNull();
  const pinned = await storage.readRecoveryAttempt(2);
  disk.failRevision = null;
  await expect(
    storage.retainRecoveryResult(pinned, { ...delivery, receipt: 'c'.repeat(64) }, png)
  ).rejects.toThrow();
  const confirmed = await storage.readRecoveryAttempt(2);
  const retained = await storage.retainRecoveryResult(confirmed, delivery, png);
  expect(retained.receipt.recovery.state).toBe('retained');
  expect(await createAiStorage().pictures()).toEqual([retained.picture]);
});

it('rejects mismatched result bytes before pinning or publishing a picture', async () => {
  const { storage, receipt } = await preparedRecovery();
  const marked = await storage.markRecoverySubmission(receipt);
  await expect(
    storage.retainRecoveryResult(marked, deliveryFor(marked), new Uint8Array(rgbaPng(2, 2, 0)))
  ).rejects.toThrow();
  expect(disk.raw.attempts[1].receipt.recovery.state).toBe('submission-uncertain');
  expect(await createAiStorage().pictures()).toEqual([]);
});

it('requires exact ACK200 evidence and preserves the retained picture through acknowledgement', async () => {
  const { storage, retained } = await retainedRecovery();
  await expect(
    storage.recordAck(retained.receipt, { ...ackFor(retained.receipt), status: 202 })
  ).rejects.toThrow();
  const current = await storage.readRecoveryAttempt(2);
  const acknowledged = await storage.recordAck(current, ackFor(current));
  expect(acknowledged.recovery.state).toBe('acknowledged');
  expect(acknowledged.journal.result).toEqual(retained.picture);
  const revision = disk.raw.revision;
  expect(await storage.recordAck(acknowledged, ackFor(acknowledged))).toBe(acknowledged);
  expect(disk.raw.revision).toBe(revision);
});

it('does not downgrade a retained result when delayed admission statuses arrive', async () => {
  const { storage, retained } = await retainedRecovery();
  const revision = disk.raw.revision;
  expect(
    await storage.recordRecoveryAdmission(retained.receipt, admittedStatus(retained.receipt))
  ).toBe(retained.receipt);
  expect(disk.raw.revision).toBe(revision);
  expect(disk.raw.attempts[1].receipt.journal.result).toEqual(retained.picture);
});

it('blocks ACK after retained storage bytes change', async () => {
  const { storage, retained } = await retainedRecovery();
  disk.raw.attempts[1].receipt.journal.result.uri = `data:image/png;base64,${rgbaPng(2, 2, 0).toString('base64')}`;
  await expect(storage.recordAck(retained.receipt, ackFor(retained.receipt))).rejects.toThrow();
  expect(disk.raw.attempts[1].receipt.recovery.state).toBe('retained');
});

it('rejects persisted permission and source-held changes at the real state reader', async () => {
  await preparedRecovery();
  disk.raw.attempts[1].receipt.recovery.parentProof = 'reusable-proof';
  await expect(createAiStorage().read()).rejects.toThrow();
});

it('requires reread when the result commits but transaction completion is uncertain', async () => {
  const { storage, receipt } = await preparedRecovery();
  const marked = await storage.markRecoverySubmission(receipt);
  disk.uncertainRevision = disk.raw.revision + 2;
  await expect(storage.retainRecoveryResult(marked, deliveryFor(marked), png)).rejects.toThrow(
    'unconfirmed'
  );
  expect(disk.raw.attempts[1].receipt.recovery.state).toBe('retained');
  await expect(storage.recordAck(marked, ackFor(disk.raw.attempts[1].receipt))).rejects.toThrow();
  const current = await storage.readRecoveryAttempt(2);
  disk.uncertainRevision = null;
  const revision = disk.raw.revision;
  const retained = await storage.retainRecoveryResult(current, deliveryFor(current), png);
  expect(disk.raw.revision).toBe(revision);
  expect((await storage.recordAck(retained.receipt, ackFor(retained.receipt))).recovery.state).toBe(
    'acknowledged'
  );
});

it('preserves a checked terminal outcome and creates a separate successor from the original held source', async () => {
  const { storage, source, receipt } = await preparedRecovery();
  const marked = await storage.markRecoverySubmission(receipt);
  const refused = await storage.recordRecoveryAdmission(marked, {
    ...admittedStatus(marked),
    phase: 'refusal',
  });
  expect(refused.recovery.state).toBe('terminal');
  expect(refused.journal.phase).toBe('failed');
  const held = await storage.readRecoveryAttempt(1);
  const next = await storage.prepareRecoverySendFromHeld(held, 3, 3000, recoveryCredential);
  expect(next.recovery.state).toBe('prepared');
  expect(disk.raw.attempts[0].receipt).toEqual(source);
  expect(disk.raw.attempts[1].receipt).toEqual(refused);
});

it('lets only one tab append a recovery successor from the same held state', async () => {
  const a = createAiStorage(),
    b = createAiStorage();
  const sourceA = await a.prepareRecovery(journal(1, 'unknown'), model, png, recoveryCredential);
  const sourceB = (await b.read()).receipt;
  const outcomes = await Promise.allSettled([
    a.prepareRecoverySendFromHeld(sourceA, 2, 2000, recoveryCredential),
    b.prepareRecoverySendFromHeld(sourceB, 2, 2000, recoveryCredential),
  ]);
  expect(outcomes.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(disk.raw.attempts).toHaveLength(2);
  expect(disk.raw.attempts[0].receipt).toEqual(sourceA);
});
