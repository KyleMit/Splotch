import {
  LibraryFault,
  LIBRARY_TEXT_LIMIT_BYTES,
  type LibraryPlatform,
  type LibraryEnvironment,
} from '../offlineLibrary/contract';
import { approvedAssetUrl, MAX_PACK_FILE_BYTES, type PackFile } from '../offlineLibrary/manifest';
import { isOfflineBookId } from '../offlineLibrary/identity';
import { requireLibraryPath, libraryFault, WebLibraryStorage } from './offlineLibraryStorage.web';
import {
  downloadLibraryFile,
  matchesLibraryFile,
  requireLibraryFile,
} from './offlineLibraryTransfer.web';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function meteredConnection(): boolean {
  const connection: unknown =
    Reflect.get(navigator, 'connection') ??
    Reflect.get(navigator, 'mozConnection') ??
    Reflect.get(navigator, 'webkitConnection');
  if (!record(connection)) return true;
  if (connection.saveData === true || connection.type === 'cellular') return true;
  if (typeof connection.metered === 'boolean') return connection.metered;
  return connection.type !== 'wifi' && connection.type !== 'ethernet';
}
function networkEnvironment(): Pick<LibraryEnvironment, 'online' | 'metered'> {
  if (typeof navigator === 'undefined') throw libraryFault(null);
  return { online: navigator.onLine === true, metered: meteredConnection() };
}
function requireDestination(path: string, file: PackFile): void {
  requireLibraryPath(path);
  requireLibraryFile(file);
  const root = path.split('/')[0];
  const directory = root.replace(/^staging-/, '').match(/^([a-z]+)-([a-f0-9]{64})$/);
  if (!directory || !isOfflineBookId(directory[1]))
    throw new LibraryFault('corrupt', 'The coloring storage directory is invalid.');
  if (
    file.path === '' &&
    file.downloadPath === '' &&
    path === `${root}/identity.json` &&
    file.bytes <= LIBRARY_TEXT_LIMIT_BYTES &&
    file.sha256 === directory[2]
  )
    return;
  try {
    approvedAssetUrl(file.path);
    approvedAssetUrl(file.downloadPath);
  } catch {
    throw new LibraryFault('corrupt', 'The coloring catalog contains an unapproved asset.');
  }
  const name = file.path.split('/').at(-1);
  const book = file.path.split('/')[2];
  if (book !== directory[1] || path !== `${root}/files/${name}`)
    throw new LibraryFault('corrupt', 'The coloring file does not match its storage path.');
}
type ImageUrl = Readonly<{ uri: string; bytes: number; sha256: string }>;

class WebLibraryPlatform implements LibraryPlatform {
  private readonly storage = new WebLibraryStorage();
  private readonly urls = new Map<string, ImageUrl>();
  private readonly transfers = new Set<AbortController>();
  private disposed = false;
  private pending: Promise<unknown> = Promise.resolve();
  private active() {
    if (this.disposed) throw libraryFault(null);
  }
  private queue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending
      .catch(() => undefined)
      .then(async () => {
        this.active();
        try {
          return await action();
        } catch (error) {
          throw libraryFault(error);
        }
      });
    this.pending = next;
    return next;
  }
  private revoke(path: string) {
    const entry = this.urls.get(path);
    if (entry) URL.revokeObjectURL(entry.uri);
    this.urls.delete(path);
  }
  private prepare(path: string, bytes: Uint8Array, file: PackFile) {
    this.active();
    if (!path.endsWith('.webp')) return;
    const old = this.urls.get(path);
    if (old && old.bytes === file.bytes && old.sha256 === file.sha256) return;
    const uri = URL.createObjectURL(
      new Blob([new Uint8Array(bytes).buffer], { type: 'image/webp' })
    );
    this.revoke(path);
    this.urls.set(path, { uri, bytes: file.bytes, sha256: file.sha256 });
  }
  async environment(): Promise<LibraryEnvironment> {
    this.active();
    if (typeof navigator === 'undefined') throw libraryFault(null);
    let freeBytes = 0;
    try {
      const estimate = await navigator.storage?.estimate();
      if (
        estimate &&
        typeof estimate.quota === 'number' &&
        typeof estimate.usage === 'number' &&
        Number.isFinite(estimate.quota) &&
        Number.isFinite(estimate.usage) &&
        estimate.quota >= 0 &&
        estimate.usage >= 0
      )
        freeBytes = Math.max(0, Math.floor(estimate.quota - estimate.usage));
    } catch {
      // An unknown quota cannot authorize new storage, but existing books remain readable.
    }
    this.active();
    return { ...networkEnvironment(), freeBytes };
  }
  list() {
    return this.queue(() => this.storage.list());
  }
  read(path: string, maximum: number) {
    return this.queue(() => this.storage.read(path, maximum));
  }
  async write(path: string, bytes: Uint8Array): Promise<void> {
    requireLibraryPath(path);
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_PACK_FILE_BYTES)
      throw new LibraryFault('corrupt', 'The coloring file is larger than expected.');
    if (
      !path.endsWith('.webp') &&
      !path.endsWith('.svg') &&
      bytes.length > LIBRARY_TEXT_LIMIT_BYTES
    )
      throw new LibraryFault('corrupt', 'Coloring metadata is larger than expected.');
    const copy = new Uint8Array(bytes);
    return this.queue(async () => {
      const old = this.urls.get(path);
      const unchanged =
        old &&
        (await matchesLibraryFile(copy, {
          path: '',
          downloadPath: '',
          bytes: old.bytes,
          sha256: old.sha256,
        }));
      await this.storage.write(path, copy);
      if (old && !unchanged) this.revoke(path);
    });
  }
  remove(prefix: string) {
    return this.queue(async () => {
      await this.storage.remove(prefix);
      for (const path of this.urls.keys())
        if (path === prefix || path.startsWith(`${prefix}/`)) this.revoke(path);
    });
  }
  move(from: string, to: string) {
    return this.queue(async () => {
      await this.storage.move(from, to);
      if (from === to) return;
      const source = this.urls.get(from);
      const destination = this.urls.get(to);
      if (
        destination &&
        source &&
        destination.bytes === source.bytes &&
        destination.sha256 === source.sha256
      )
        this.revoke(from);
      else {
        this.revoke(to);
        if (source) {
          this.urls.set(to, source);
          this.urls.delete(from);
        }
      }
    });
  }
  uri(path: string) {
    this.active();
    requireLibraryPath(path);
    const entry = this.urls.get(path);
    if (!entry) throw new LibraryFault('corrupt', 'This coloring image has not been verified.');
    return entry.uri;
  }
  verify(path: string, file: PackFile) {
    return this.queue(async () => {
      requireDestination(path, file);
      let bytes: Uint8Array | null;
      try {
        bytes = await this.storage.read(path, file.bytes);
      } catch (error) {
        if (error instanceof LibraryFault && error.code === 'corrupt') return false;
        throw error;
      }
      if (!bytes || !(await matchesLibraryFile(bytes, file))) return false;
      this.prepare(path, bytes, file);
      return true;
    });
  }
  download(
    path: string,
    file: PackFile,
    signal: AbortSignal,
    allowMetered: boolean,
    progress: (bytes: number) => void
  ) {
    return this.queue(async () => {
      requireDestination(path, file);
      if (!path.startsWith('staging-'))
        throw new LibraryFault('unavailable', 'Coloring downloads require staging storage.');
      const transfer = new AbortController();
      const cancel = () =>
        transfer.abort(new LibraryFault('cancelled', 'Coloring download cancelled.'));
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
      this.transfers.add(transfer);
      try {
        const bytes = await downloadLibraryFile(
          file,
          transfer.signal,
          allowMetered,
          async () => {
            this.active();
            return networkEnvironment();
          },
          progress
        );
        this.active();
        if (transfer.signal.aborted) throw transfer.signal.reason;
        await this.storage.write(path, bytes);
        if (transfer.signal.aborted) throw transfer.signal.reason;
        const readback = await this.storage.read(path, file.bytes);
        if (!readback || !(await matchesLibraryFile(readback, file)))
          throw new LibraryFault('corrupt', 'The coloring download could not be confirmed.');
        this.prepare(path, readback, file);
      } finally {
        this.transfers.delete(transfer);
        signal.removeEventListener('abort', cancel);
      }
    });
  }
  dispose() {
    this.disposed = true;
    for (const transfer of this.transfers)
      transfer.abort(new LibraryFault('cancelled', 'Coloring download cancelled.'));
    for (const path of this.urls.keys()) this.revoke(path);
    this.storage.dispose();
  }
}
export function createLibraryPlatform(): LibraryPlatform {
  return new WebLibraryPlatform();
}
