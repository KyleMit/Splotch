import { openDatabase, type DBSchema, type IdbDatabase } from '../lib/idbDatabase';
import type {
  AiJournal,
  AiPreparedReceipt,
  AiRecoveryHeldReceipt,
  AiRecoveryRequestReceipt,
} from '../ai/journal';
import {
  AI_STORAGE_DATABASE,
  AI_STORAGE_KEY,
  AI_STORAGE_STORE,
  invalidAiStorage,
  parseWebAiState,
  verifyWebAiState,
  type WebAiAttempt,
  type WebAiReceipt,
  type WebAiState,
} from './aiStorageRecords.web';

import { assertRecoveryRequestProgress } from './nativeAiReceipt';

interface AiDatabase extends DBSchema {
  state: { key: string; value: unknown };
}

export function sameAiIdentity(before: AiJournal, after: AiJournal): boolean {
  return (
    before.id === after.id &&
    before.createdAt === after.createdAt &&
    before.style === after.style &&
    before.originalId === after.originalId
  );
}
function assertReceiptProgress(previous: WebAiAttempt, next: WebAiAttempt): void {
  const a = previous.receipt;
  const b = next.receipt;
  if (
    !sameAiIdentity(a.journal, b.journal) ||
    a.kind !== b.kind ||
    a.nonce !== b.nonce ||
    a.originalDigest !== b.originalDigest ||
    a.inputDigest !== b.inputDigest ||
    a.inputLength !== b.inputLength ||
    previous.originalModel !== next.originalModel ||
    previous.upload !== next.upload ||
    b.revision < a.revision ||
    (b.revision === a.revision && JSON.stringify(a) !== JSON.stringify(b)) ||
    (a.journal.phase === 'result' && JSON.stringify(a.journal) !== JSON.stringify(b.journal)) ||
    (a.journal.phase === 'failed' && !['failed', 'result'].includes(b.journal.phase)) ||
    (a.journal.jobId !== null && a.journal.jobId !== b.journal.jobId) ||
    (a.resultDigest !== null &&
      (a.resultDigest !== b.resultDigest || a.resultLength !== b.resultLength))
  )
    invalidAiStorage();
  if (a.kind === 'recovery-request' && b.kind === 'recovery-request')
    assertRecoveryRequestProgress(a, b);
  if (
    a.kind === 'recovery-held' &&
    b.kind === 'recovery-held' &&
    (a.recovery.id !== b.recovery.id ||
      JSON.stringify(a.recovery.credential) !== JSON.stringify(b.recovery.credential) ||
      (a.recovery.intent === 'committed' && b.recovery.intent !== 'committed') ||
      (a.recovery.expiry.kind === 'known' &&
        JSON.stringify(a.recovery.expiry) !== JSON.stringify(b.recovery.expiry)))
  )
    invalidAiStorage();
}

// A finished plain run, which storage holds only while its picture is on screen (#3025).
function releasable(attempt: WebAiAttempt): boolean {
  return (
    attempt.receipt.kind === 'prepared' &&
    ['result', 'failed'].includes(attempt.receipt.journal.phase)
  );
}

// A new plain run replaces saved attempts, including a run abandoned by another process. A plain
// run also leaves once its picture is closed, possibly after another process last saw it unfinished.
function departedAttempt(previous: WebAiAttempt, newest: WebAiReceipt | undefined): boolean {
  return (
    previous.receipt.kind === 'prepared' ||
    (newest?.kind === 'prepared' && previous.receipt.journal.id < newest.journal.id)
  );
}

export class WebAiStorageOwner {
  private connection: Promise<IdbDatabase<AiDatabase>> | undefined;
  private snapshot: WebAiState | null = null;
  private loaded = false;
  private uncertain = false;
  private current: WebAiReceipt | null = null;
  private pending: Promise<unknown> = Promise.resolve();
  private database() {
    if (!this.connection) {
      const opening = openDatabase<AiDatabase>(AI_STORAGE_DATABASE, AI_STORAGE_STORE);
      this.connection = opening;
      void opening.then(
        (db) =>
          db.closed.then(() => {
            if (this.connection === opening) this.connection = undefined;
          }),
        () => {
          if (this.connection === opening) this.connection = undefined;
        }
      );
    }
    return this.connection;
  }
  // Work that rereads the stored state before acting on it may run after an unconfirmed write.
  queue<T>(rereads: boolean, work: () => Promise<T>): Promise<T> {
    const next = this.pending
      .catch(() => {})
      .then(async () => {
        if (this.uncertain && !rereads) invalidAiStorage();
        try {
          return await work();
        } catch (error) {
          this.uncertain = true;
          throw error;
        }
      });
    this.pending = next;
    return next;
  }
  private assertProgress(after: WebAiState | null): void {
    const before = this.snapshot;
    if (!before) return;
    if (!after || after.revision < before.revision) invalidAiStorage();
    if (after.revision === before.revision && JSON.stringify(after) !== JSON.stringify(before))
      invalidAiStorage();
    const newest = after.attempts.at(-1)?.receipt;
    for (const previous of before.attempts) {
      const next = after.attempts.find(
        (attempt) => attempt.receipt.journal.id === previous.receipt.journal.id
      );
      if (next) assertReceiptProgress(previous, next);
      else if (!departedAttempt(previous, newest)) invalidAiStorage();
    }
  }
  async readState(): Promise<WebAiState | null> {
    const db = await this.database();
    const transaction = db.transaction(AI_STORAGE_STORE, 'readonly');
    const [raw] = await Promise.all([transaction.store.get(AI_STORAGE_KEY), transaction.done]);
    const found = raw === undefined ? null : parseWebAiState(raw);
    if (found) await verifyWebAiState(found);
    this.assertProgress(found);
    return found;
  }
  async load(): Promise<void> {
    const found = await this.readState();
    this.snapshot = found;
    this.loaded = true;
    this.current = found?.attempts.at(-1)?.receipt ?? null;
    this.uncertain = false;
  }
  async ready(): Promise<void> {
    if (!this.loaded) await this.load();
  }
  latest(): WebAiReceipt | null {
    return this.current;
  }
  attempts(): readonly WebAiAttempt[] {
    return this.snapshot?.attempts ?? [];
  }
  owned(id: number): WebAiReceipt {
    const receipt = this.snapshot?.attempts.find(
      (attempt) => attempt.receipt.journal.id === id
    )?.receipt;
    if (!receipt) invalidAiStorage();
    return receipt;
  }
  prepared(id: number): AiPreparedReceipt {
    const receipt = this.owned(id);
    if (receipt.kind !== 'prepared') invalidAiStorage();
    return receipt;
  }
  held(receipt: AiRecoveryHeldReceipt): void {
    if (this.owned(receipt.journal.id) !== receipt || receipt.kind !== 'recovery-held')
      invalidAiStorage();
  }
  request(receipt: AiRecoveryRequestReceipt): void {
    if (this.owned(receipt.journal.id) !== receipt || receipt.kind !== 'recovery-request')
      invalidAiStorage();
  }
  async commit(attempts: readonly WebAiAttempt[]): Promise<WebAiReceipt> {
    const receipt = (await this.save(attempts)).attempts.at(-1)?.receipt;
    if (!receipt) invalidAiStorage();
    return receipt;
  }
  // Drops the finished run `id` once its picture is closed, leaving an unfinished or unknown one.
  async release(id: number): Promise<void> {
    const attempts = this.attempts();
    const released = attempts.find((attempt) => attempt.receipt.journal.id === id);
    if (!released || !releasable(released)) return;
    await this.save(attempts.filter((attempt) => attempt !== released));
  }
  private async save(attempts: readonly WebAiAttempt[]): Promise<WebAiState> {
    const before = this.snapshot;
    const revision = (before?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) invalidAiStorage();
    const next = parseWebAiState({ version: 1, revision, attempts });
    this.assertProgress(next);
    const expected = JSON.stringify(before);
    const db = await this.database();
    const transaction = db.transaction(AI_STORAGE_STORE, 'readwrite');
    await Promise.all([
      transaction.store.get(AI_STORAGE_KEY).then(async (raw) => {
        const existing = raw === undefined ? null : parseWebAiState(raw);
        if (JSON.stringify(existing) !== expected) invalidAiStorage();
        await transaction.store.put(next, AI_STORAGE_KEY);
      }),
      transaction.done,
    ]);
    this.snapshot = next;
    this.current = next.attempts.at(-1)?.receipt ?? null;
    return next;
  }
  async replace(receipt: WebAiReceipt): Promise<WebAiReceipt> {
    if (!this.snapshot) invalidAiStorage();
    const attempts = [...this.snapshot.attempts];
    const index = attempts.findIndex(
      (attempt) => attempt.receipt.journal.id === receipt.journal.id
    );
    if (index < 0) invalidAiStorage();
    attempts[index] = { ...attempts[index], receipt };
    await this.commit(attempts);
    return this.owned(receipt.journal.id);
  }
}
