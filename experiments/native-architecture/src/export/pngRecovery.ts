import {
  assertHeldPngCapacity,
  heldPngFilename,
  parseHeldPngs,
  serializeHeldPngs,
  validateHeldPng,
  type HeldPng,
  type HeldPngDelivery,
  type HeldPngStorage,
  type PngDeliveryResult,
} from './heldPng';

export type PngAttempt =
  | Readonly<{ status: 'held' | PngDeliveryResult }>
  | Readonly<{ status: 'failed'; message: string }>;
type Entry = { picture: HeldPng; durable: boolean; attempt: PngAttempt };
export type PngRecoveryState = Readonly<{
  status: 'loading' | 'ready' | 'unreadable';
  pictures: readonly Readonly<{
    id: string;
    filename: string;
    durable: boolean;
    attempt: PngAttempt;
  }>[];
  busy: boolean;
  notice: string;
}>;

export const INITIAL_PNG_RECOVERY: PngRecoveryState = {
  status: 'loading',
  pictures: [],
  busy: false,
  notice: '',
};

function message(error: unknown) {
  return error instanceof Error ? error.message : 'PNG export did not finish.';
}

class PngRecovery {
  private live = true;
  private generation = 0;
  private sequence = 0;
  private latestNotice = 0;
  private writeRevision = 0;
  private readable = false;
  private loading: Promise<void> | null = null;
  private status: PngRecoveryState['status'] = 'loading';
  private notice = '';
  private storageFailure = '';
  private needsWrite = false;
  private entries: Entry[] = [];
  private readonly delivering = new Set<string>();

  constructor(
    private readonly storage: HeldPngStorage,
    private readonly deliver: HeldPngDelivery,
    private readonly changed: (state: PngRecoveryState) => void
  ) {}

  private emit() {
    if (!this.live) return;
    this.changed({
      status: this.status,
      pictures: this.entries.map(({ picture, durable, attempt }) => ({
        id: picture.id,
        filename: picture.filename,
        durable,
        attempt,
      })),
      busy: this.loading !== null || this.delivering.size > 0,
      notice: this.storageFailure || this.notice,
    });
  }

  private owns(entry: Entry) {
    return this.live && this.entries.includes(entry);
  }

  private current(entry: Entry, expectedGeneration: number) {
    return this.generation === expectedGeneration && this.owns(entry);
  }

  private async persist() {
    if (!this.live || !this.readable) return;
    const revision = ++this.writeRevision;
    const included = this.entries.slice();
    const snapshot = serializeHeldPngs(included.map(({ picture }) => picture));
    this.needsWrite = true;
    try {
      await this.storage.write(snapshot);
      if (!this.live) return;
      for (const entry of included) if (this.entries.includes(entry)) entry.durable = true;
      if (revision === this.writeRevision) {
        this.needsWrite = false;
        this.storageFailure = '';
      }
    } catch {
      if (this.live && revision === this.writeRevision)
        this.storageFailure = this.entries.some((entry) => !entry.durable)
          ? 'Recovery storage is unavailable. Some PNGs are held only while this screen stays open.'
          : 'PNG recovery cleanup did not finish. A dismissed PNG may return after restart.';
    }
    this.emit();
  }

  private async read(expectedGeneration: number) {
    try {
      const snapshot = await this.storage.read();
      const stored = await parseHeldPngs(
        snapshot,
        () => this.live && this.generation === expectedGeneration
      );
      if (!this.live || this.generation !== expectedGeneration) return;
      const known = new Map(this.entries.map((entry) => [entry.picture.base64, entry]));
      const merged = stored.map<Entry>(
        (picture) =>
          known.get(picture.base64) ?? {
            picture,
            durable: true,
            attempt: { status: 'held' },
          }
      );
      for (const entry of this.entries) if (!merged.includes(entry)) merged.push(entry);
      assertHeldPngCapacity(merged.map(({ picture }) => picture));
      this.entries = merged;
      this.readable = true;
      this.status = 'ready';
      this.storageFailure = '';
      if (this.entries.some((entry) => !entry.durable)) await this.persist();
    } catch {
      if (!this.live || this.generation !== expectedGeneration) return;
      this.readable = false;
      this.status = 'unreadable';
      this.storageFailure =
        'Held PNGs could not be read. Existing recovery data has not been replaced.';
    }
  }

  async restore() {
    if (!this.live || this.loading) return this.loading;
    this.status = 'loading';
    const job = this.read(this.generation);
    this.loading = job;
    this.emit();
    try {
      await job;
    } finally {
      if (this.loading === job) this.loading = null;
      this.emit();
    }
  }

  private async attempt(entry: Entry, noticeOwner: number) {
    if (!this.live || this.delivering.has(entry.picture.id)) return;
    this.delivering.add(entry.picture.id);
    entry.attempt = { status: 'held' };
    this.emit();
    try {
      await this.persist();
      if (!this.owns(entry)) return;
      const outcome = await this.deliver(entry.picture, () => this.owns(entry));
      if (!this.owns(entry)) return;
      entry.attempt = { status: outcome };
      if (noticeOwner === this.latestNotice)
        this.notice =
          outcome === 'sharing-closed'
            ? 'PNG share sheet closed. The PNG is kept until you dismiss it.'
            : 'PNG download requested. The PNG is kept until you dismiss it.';
    } catch (error) {
      if (!this.owns(entry)) return;
      entry.attempt = { status: 'failed', message: message(error) };
      if (noticeOwner === this.latestNotice) this.notice = entry.attempt.message;
    } finally {
      this.delivering.delete(entry.picture.id);
      this.emit();
    }
  }

  async submit(base64: string) {
    const expectedGeneration = this.generation;
    const noticeOwner = ++this.latestNotice;
    if (!this.readable) await this.restore();
    await validateHeldPng(base64, () => this.live && this.generation === expectedGeneration);
    if (!this.live || this.generation !== expectedGeneration) return;
    let entry = this.entries.find((candidate) => candidate.picture.base64 === base64);
    if (!entry) {
      const id = `png-${Date.now()}-${(++this.sequence).toString(36)}${Math.random().toString(36).slice(2) || '0'}`;
      const picture: HeldPng = { id, filename: heldPngFilename(id), base64 };
      assertHeldPngCapacity([...this.entries.map((candidate) => candidate.picture), picture]);
      entry = { picture, durable: false, attempt: { status: 'held' } };
      this.entries.push(entry);
    }
    this.notice = '';
    await this.attempt(entry, noticeOwner);
  }

  async retry() {
    const expectedGeneration = this.generation;
    const noticeOwner = ++this.latestNotice;
    if (!this.readable) await this.restore();
    if (!this.live || this.generation !== expectedGeneration) return;
    if (this.needsWrite) await this.persist();
    const pending = this.entries.slice();
    for (const entry of pending) {
      if (!this.current(entry, expectedGeneration)) continue;
      await this.attempt(entry, noticeOwner);
    }
  }

  async dismiss(id: string) {
    if (!this.live) return;
    if (!this.entries.some((entry) => entry.picture.id === id)) return;
    this.generation++;
    this.latestNotice++;
    this.entries = this.entries.filter((entry) => entry.picture.id !== id);
    this.notice = '';
    this.storageFailure = this.readable
      ? ''
      : 'Existing unreadable recovery data has not been replaced.';
    this.status = this.readable ? 'ready' : 'unreadable';
    this.emit();
    await this.persist();
  }

  dispose() {
    this.live = false;
    this.generation++;
  }
}

export function createPngRecovery(
  storage: HeldPngStorage,
  deliver: HeldPngDelivery,
  changed: (state: PngRecoveryState) => void
) {
  return new PngRecovery(storage, deliver, changed);
}
