import {
  openDatabase,
  type DBSchema,
  type IdbDatabase,
  type IdbTransaction,
} from '../../../../web/src/lib/idbDatabase';
import type { DrawingBackend } from '../product/drawingBackend';
import {
  claimDraftAuthority,
  DRAFT_DATABASE,
  DRAFT_STORE,
  hasDraftAuthority,
  invalidDraftRecord,
  newDraftRecord,
  parseDraftRecord,
  readLegacyDraft,
  sameDraftRecord,
  type WebDrawingDraftRecord,
} from './drawingDraftRecords.web';

interface DraftDatabase extends DBSchema {
  drafts: { key: DrawingBackend; value: unknown };
}
type DraftTransaction = IdbTransaction<DraftDatabase, 'drafts'>;

class WebDraftDatabase {
  private connection: Promise<IdbDatabase<DraftDatabase>> | undefined;

  private database(): Promise<IdbDatabase<DraftDatabase>> {
    if (!this.connection) {
      const opening = openDatabase<DraftDatabase>(DRAFT_DATABASE, DRAFT_STORE);
      this.connection = opening;
      void opening.then(
        (database) =>
          database.closed.then(() => {
            if (this.connection === opening) this.connection = undefined;
          }),
        () => {
          if (this.connection === opening) this.connection = undefined;
        }
      );
    }
    return this.connection;
  }

  async transaction<T>(
    mode: IDBTransactionMode,
    action: (transaction: DraftTransaction) => Promise<T>
  ): Promise<T> {
    const transaction = (await this.database()).transaction(DRAFT_STORE, mode);
    try {
      const [result] = await Promise.all([action(transaction), transaction.done]);
      return result;
    } catch (error) {
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }

  async rawSnapshot(backend: DrawingBackend): Promise<string | null> {
    const raw = await this.transaction('readonly', (transaction) => transaction.store.get(backend));
    if (raw !== undefined) return parseDraftRecord(raw).snapshot;
    if (hasDraftAuthority(backend)) invalidDraftRecord();
    return readLegacyDraft(backend);
  }
}

export class WebDrawingDraftOwner {
  private readonly database = new WebDraftDatabase();
  private expected: WebDrawingDraftRecord | undefined;
  private uncertain: WebDrawingDraftRecord | undefined;
  private conflicted = false;

  constructor(private readonly backend: DrawingBackend) {}

  private conflict(): never {
    this.conflicted = true;
    throw new Error('Another tab changed the current draft. Save your picture in Pictures.');
  }

  private checkedRecord(raw: unknown): WebDrawingDraftRecord {
    if (this.conflicted) this.conflict();
    if (raw === undefined || !this.expected) this.conflict();
    let found: WebDrawingDraftRecord;
    try {
      found = parseDraftRecord(raw);
    } catch (error) {
      this.conflicted = true;
      throw error;
    }
    if (
      !sameDraftRecord(found, this.expected) &&
      !(this.uncertain && sameDraftRecord(found, this.uncertain))
    ) {
      this.conflict();
    }
    return found;
  }

  async read(): Promise<string | null> {
    if (this.conflicted) this.conflict();
    const found = await this.database.transaction(
      this.expected ? 'readonly' : 'readwrite',
      async (tx) => {
        const raw = await tx.store.get(this.backend);
        if (this.expected) return this.checkedRecord(raw);
        if (raw !== undefined) {
          const record = parseDraftRecord(raw);
          claimDraftAuthority(this.backend);
          return record;
        }
        if (hasDraftAuthority(this.backend)) invalidDraftRecord();
        const record = newDraftRecord(1, readLegacyDraft(this.backend));
        claimDraftAuthority(this.backend);
        await tx.store.put(record, this.backend);
        return record;
      }
    );
    this.expected = found;
    this.uncertain = undefined;
    return found.snapshot;
  }

  async write(snapshot: string): Promise<void> {
    if (this.conflicted) this.conflict();
    if (!this.expected) throw new Error('Recover the current draft before saving.');
    if (this.uncertain) await this.read();
    const found = await this.database.transaction('readwrite', async (tx) => {
      const previous = this.checkedRecord(await tx.store.get(this.backend));
      const next = newDraftRecord(previous.revision + 1, snapshot);
      this.uncertain = next;
      await tx.store.put(next, this.backend);
      return next;
    });
    this.expected = found;
    this.uncertain = undefined;
  }
}

const protectionDatabase = new WebDraftDatabase();

export function readProtectedDraftSnapshot(backend: DrawingBackend): Promise<string | null> {
  return protectionDatabase.rawSnapshot(backend);
}
