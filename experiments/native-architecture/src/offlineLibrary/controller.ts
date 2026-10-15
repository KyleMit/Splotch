import { OFFLINE_BOOKS } from './books.generated';
import {
  type OfflineBookId,
  type Pack,
  type PackResolution,
  type OfflinePageSlug,
} from './manifest';
import { isOfflinePageId } from './identity';
import {
  LibraryFault,
  LIBRARY_TEXT_LIMIT_BYTES,
  LIBRARY_POLICY_PATH,
  encodeLibraryText,
  decodeLibraryText,
  requireDownloadNetwork,
  hasBackgroundTransfers,
  type LibraryPlatform,
} from './contract';
import { createLibraryStore } from './store';
import type { ArtOrientation } from '../drawing/paperSpace';
import {
  initialLibrarySnapshot,
  LIBRARY_UNAVAILABLE_MESSAGE,
  type LibrarySnapshot,
} from './snapshot';
export type { LibrarySnapshot } from './snapshot';

function faultFrom(error: unknown): LibraryFault {
  if (error instanceof LibraryFault) return error;
  const message = error instanceof Error ? error.message : '';
  if (/space|ENOSPC|quota|disk.*full/i.test(message))
    return new LibraryFault(
      'storage-full',
      'There is not enough free space for this coloring book.'
    );
  return new LibraryFault('unavailable', LIBRARY_UNAVAILABLE_MESSAGE);
}
class OfflineLibraryController {
  private readonly store;
  private catalog: typeof import('./catalog') | null = null;
  private readonly listeners = new Set<() => void>();
  private state = initialLibrarySnapshot;
  private epoch = 0;
  private transfer: AbortController | null = null;
  private initialization: Promise<void> | null = null;
  private engaged = false;
  private featureEnabled = false;
  private paused = false;
  private consumers = 0;
  private policyWrites: Promise<void> = Promise.resolve();
  private operation: Promise<void> | null = null;
  constructor(
    private readonly platform: LibraryPlatform,
    private readonly resolution: PackResolution
  ) {
    this.store = createLibraryStore(platform);
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<LibrarySnapshot>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }
  private fail(error: unknown) {
    const fault = faultFrom(error);
    this.publish({
      status: fault.code === 'offline' || fault.code === 'metered' ? 'waiting' : 'failed',
      fault: fault.code,
      message: fault.message,
      activeBook: null,
    });
  }
  private abort(message: string) {
    this.epoch++;
    this.transfer?.abort();
    this.transfer = null;
    if (hasBackgroundTransfers(this.platform)) {
      const epoch = this.epoch;
      void this.platform.cancelInstallations().catch((error: unknown) => {
        if (epoch === this.epoch) this.fail(error);
      });
    }
    if (this.state.status === 'downloading')
      this.publish({ status: 'ready', activeBook: null, message, fault: null });
  }
  async initialize() {
    if (!this.initialization) this.initialization = this.load();
    await this.initialization;
  }
  private async load() {
    try {
      await this.platform.environment();
      this.catalog ??= await import('./catalog');
      const policy = await this.platform.read(LIBRARY_POLICY_PATH, LIBRARY_TEXT_LIMIT_BYTES);
      if (policy) {
        const parsed: unknown = JSON.parse(decodeLibraryText(policy));
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('enabled' in parsed) ||
          !('allowMetered' in parsed) ||
          typeof parsed.enabled !== 'boolean' ||
          typeof parsed.allowMetered !== 'boolean'
        )
          throw new LibraryFault('corrupt', 'Coloring download settings could not be read.');
        this.publish({ enabled: parsed.enabled, allowMetered: parsed.allowMetered });
      }
      const installed = await this.store.inventory(
        OFFLINE_BOOKS.map((book) => this.currentPack(book.id))
      );
      this.publish({ status: 'ready', installed, inventoried: true, fault: null });
    } catch (error) {
      this.fail(error);
      this.initialization = null;
    }
  }
  private allowed() {
    return this.featureEnabled && this.state.enabled && this.engaged && !this.paused;
  }
  private canStartTransfer() {
    return this.allowed() && this.consumers === 0;
  }
  private currentPack(id: OfflineBookId): Pack {
    if (!this.catalog)
      throw new LibraryFault('unavailable', 'The coloring catalog is unavailable.');
    return this.catalog.catalogPack(id, this.resolution);
  }
  private pending() {
    return OFFLINE_BOOKS.some(
      (book) =>
        !this.state.installed.some((pack) => pack.revision === this.currentPack(book.id).revision)
    );
  }
  private schedule() {
    if (
      this.operation ||
      !this.canStartTransfer() ||
      this.state.status === 'failed' ||
      this.state.status === 'waiting'
    )
      return;
    const next = this.run().finally(() => {
      if (this.operation !== next) return;
      this.operation = null;
      if (this.allowed() && this.state.status === 'ready' && this.pending()) this.schedule();
    });
    this.operation = next;
  }
  private async run() {
    await this.initialize();
    if (!this.canStartTransfer() || this.state.status !== 'ready') return;
    const owner = ++this.epoch;
    const controller = new AbortController();
    this.transfer = controller;
    const isCurrent = () => owner === this.epoch && this.allowed() && !controller.signal.aborted;
    try {
      for (const book of OFFLINE_BOOKS) {
        if (!isCurrent() || !this.canStartTransfer()) return;
        const pack = this.currentPack(book.id);
        if (this.state.installed.some((item) => item.revision === pack.revision)) continue;
        const environment = await this.platform.environment();
        if (!hasBackgroundTransfers(this.platform))
          requireDownloadNetwork(environment, this.state.allowMetered);
        if (!isCurrent() || !this.canStartTransfer()) return;
        this.publish({
          status: 'downloading',
          activeBook: book.id,
          completedBytes: 0,
          totalBytes: pack.bytes,
          message: `Downloading ${book.label}.`,
          fault: null,
        });
        const installed = await this.store.install(
          pack,
          controller.signal,
          this.state.allowMetered,
          (completedBytes) => {
            if (isCurrent()) this.publish({ completedBytes });
          }
        );
        if (!isCurrent()) return;
        this.publish({
          installed: [...this.state.installed.filter((item) => item.id !== book.id), installed],
          status: 'ready',
          activeBook: null,
          message: `${book.label} is ready offline.`,
        });
      }
    } catch (error) {
      if (isCurrent()) this.fail(error);
    } finally {
      if (this.transfer === controller) this.transfer = null;
    }
  }
  setFeatureEnabled(enabled: boolean) {
    this.featureEnabled = enabled;
    if (!enabled) this.abort('');
    else this.schedule();
  }
  engage() {
    this.engaged = true;
    this.schedule();
  }
  setActive(value: boolean) {
    if (value) this.schedule();
  }
  setDrawing(value: boolean) {
    this.platform.setDrawing?.(value);
    if (!value) this.schedule();
  }
  cancel() {
    this.paused = true;
    this.abort('Coloring downloads paused. Installed books stay available.');
  }
  // An ambient retry, on the app's return to the foreground or the network's return: a failed or
  // waiting download tries again, but a removal or cancel keeps its pause, as shipping's
  // downloader keeps a removal's pause across visibility and network events.
  retryStalled() {
    if (this.paused) return;
    if (this.state.status === 'failed' || this.state.status === 'waiting') this.retry();
  }
  retry() {
    this.paused = false;
    this.publish({ status: 'ready', fault: null, message: '' });
    this.initialization = null;
    this.schedule();
  }
  private persistPolicy(enabled: boolean, allowMetered: boolean) {
    const write = this.policyWrites.then(async () => {
      await this.initialize();
      await this.platform.write(
        'policy-pending.json',
        encodeLibraryText(JSON.stringify({ enabled, allowMetered }))
      );
      await this.platform.move('policy-pending.json', LIBRARY_POLICY_PATH);
      this.publish({ enabled, allowMetered });
    });
    this.policyWrites = write.catch(() => undefined);
    return write;
  }
  async setPolicy(enabled: boolean, allowMetered: boolean) {
    this.consumers++;
    this.abort('');
    this.paused = false;
    try {
      await this.persistPolicy(enabled, allowMetered);
      this.publish({ status: 'ready', fault: null, message: '' });
    } catch (error) {
      this.fail(error);
    } finally {
      this.consumers--;
      this.schedule();
    }
  }
  async openPage(pageId: string) {
    if (!isOfflinePageId(pageId)) return;
    this.consumers++;
    if (this.transfer && !hasBackgroundTransfers(this.platform)) this.abort('');
    try {
      await this.initialize();
      const artwork = await this.store.openPage(pageId);
      this.publish({ artwork: { ...this.state.artwork, [pageId]: artwork } });
    } finally {
      this.consumers--;
      this.schedule();
    }
  }
  cover(pack: Pack, dark: boolean) {
    return this.store.cover(pack, dark);
  }
  selector(pack: Pack, page: OfflinePageSlug, orientation: ArtOrientation, dark: boolean) {
    return this.store.selector(pack, page, orientation, dark);
  }
  async remove() {
    this.paused = true;
    this.abort('');
    this.publish({ status: 'removing' });
    try {
      await this.initialize();
      this.publish({ status: 'removing', fault: null });
      await this.store.remove();
      this.publish({
        installed: [],
        status: 'ready',
        message: 'Downloaded books removed.',
      });
    } catch (error) {
      this.fail(error);
    }
  }
  // Tests await the actual transfer owner rather than timers or fabricated job completions.
  async settled() {
    await this.operation;
  }
  dispose() {
    this.paused = true;
    this.abort('');
    this.store.dispose();
    this.listeners.clear();
  }
}
export function createOfflineLibrary(platform: LibraryPlatform, resolution: PackResolution) {
  return new OfflineLibraryController(platform, resolution);
}
export type OfflineLibrary = Pick<
  OfflineLibraryController,
  | 'snapshot'
  | 'subscribe'
  | 'initialize'
  | 'setFeatureEnabled'
  | 'engage'
  | 'setActive'
  | 'setDrawing'
  | 'cancel'
  | 'retry'
  | 'retryStalled'
  | 'setPolicy'
  | 'openPage'
  | 'cover'
  | 'selector'
  | 'remove'
>;
