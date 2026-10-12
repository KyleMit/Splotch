import {
  openDatabase,
  type DBSchema,
  type IdbDatabase,
  type IdbTransaction,
} from '../../../../web/src/lib/idbDatabase';
import { LibraryFault } from '../offlineLibrary/contract';
import { MAX_PACK_FILE_BYTES } from '../offlineLibrary/manifest';

export const LIBRARY_DATABASE = 'splotch-beta-offline-library-v1';
const LIBRARY_STORE = 'files';
const INDEX_KEY = '@paths';
const MAX_PATH_CHARACTERS = 512;
export const MAX_LIBRARY_PATHS = 8 * 1024;
interface LibraryDatabase extends DBSchema {
  files: { key: string; value: unknown };
}
type Transaction = IdbTransaction<LibraryDatabase, 'files'>;

export function libraryFault(error: unknown): LibraryFault {
  if (error instanceof LibraryFault) return error;
  if (error instanceof Error && /quota|space|disk.*full/i.test(`${error.name} ${error.message}`))
    return new LibraryFault(
      'storage-full',
      'There is not enough free space for this coloring book.'
    );
  return new LibraryFault(
    'unavailable',
    'Coloring storage is unavailable. Your installed books are kept.'
  );
}
export function requireLibraryPath(path: string): void {
  if (
    typeof path !== 'string' ||
    path.length > MAX_PATH_CHARACTERS ||
    !/^[a-z0-9][a-z0-9.-]*(?:\/[a-z0-9][a-z0-9.-]*)*$/.test(path) ||
    path.includes('..')
  )
    throw new LibraryFault('unavailable', 'Invalid coloring storage path.');
}
function paths(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_LIBRARY_PATHS)
    throw new LibraryFault('corrupt', 'The coloring storage index is damaged.');
  const found = new Set<string>();
  for (const path of raw) {
    if (typeof path !== 'string')
      throw new LibraryFault('corrupt', 'The coloring storage index is damaged.');
    requireLibraryPath(path);
    if (found.has(path))
      throw new LibraryFault('corrupt', 'The coloring storage index is damaged.');
    found.add(path);
  }
  return [...found];
}
function fileBytes(raw: unknown, maximum = MAX_PACK_FILE_BYTES): Uint8Array | undefined {
  if (raw === undefined) return undefined;
  if (!(raw instanceof Uint8Array) || raw.byteLength > maximum)
    throw new LibraryFault('corrupt', 'A coloring file is damaged. Download the book again.');
  return new Uint8Array(raw);
}
export function sameLibraryBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  return a === undefined
    ? b === undefined
    : b !== undefined && a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export class WebLibraryStorage {
  private connection: Promise<IdbDatabase<LibraryDatabase>> | undefined;
  private disposed = false;
  private async database() {
    if (this.disposed) throw libraryFault(null);
    if (!this.connection) {
      const opening = openDatabase<LibraryDatabase>(LIBRARY_DATABASE, LIBRARY_STORE);
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
    const db = await this.connection;
    if (this.disposed) throw libraryFault(null);
    return db;
  }
  async list(): Promise<readonly string[]> {
    const tx = (await this.database()).transaction(LIBRARY_STORE, 'readonly');
    const [raw] = await Promise.all([tx.store.get(INDEX_KEY), tx.done]);
    return [
      ...new Set(
        paths(raw)
          .filter((path) => path.includes('/'))
          .map((path) => path.split('/')[0])
      ),
    ];
  }
  async read(path: string, maximum: number): Promise<Uint8Array | null> {
    requireLibraryPath(path);
    if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > MAX_PACK_FILE_BYTES)
      throw new LibraryFault('corrupt', 'Invalid coloring read limit.');
    const tx = (await this.database()).transaction(LIBRARY_STORE, 'readonly');
    const [raw, rawIndex] = await Promise.all([
      tx.store.get(path),
      tx.store.get(INDEX_KEY),
      tx.done,
    ]);
    if (paths(rawIndex).includes(path) !== (raw !== undefined))
      throw new LibraryFault('corrupt', 'The coloring storage index is damaged.');
    return fileBytes(raw, maximum) ?? null;
  }
  private async mutate(
    plan: (tx: Transaction, index: string[]) => Promise<Map<string, Uint8Array | undefined>>
  ) {
    const tx = (await this.database()).transaction(LIBRARY_STORE, 'readwrite');
    const done = tx.done;
    void done.catch(() => undefined);
    try {
      const beforeIndex = paths(await tx.store.get(INDEX_KEY));
      const changes = await plan(tx, beforeIndex);
      const before = new Map<string, unknown>();
      for (const path of changes.keys()) {
        const raw = await tx.store.get(path);
        if (beforeIndex.includes(path) !== (raw !== undefined))
          throw new LibraryFault('corrupt', 'The coloring storage index is damaged.');
        before.set(path, raw);
      }
      const nextIndex = new Set(beforeIndex);
      for (const [path, bytes] of changes) {
        if (bytes === undefined) nextIndex.delete(path);
        else nextIndex.add(path);
      }
      if (nextIndex.size > MAX_LIBRARY_PATHS)
        throw new LibraryFault(
          'storage-full',
          'Coloring storage is full. Your installed books are kept.'
        );
      for (const [path, bytes] of changes) await tx.store.put(bytes, path);
      const nextPaths = [...nextIndex].sort();
      await tx.store.put(nextPaths, INDEX_KEY);
      let confirmed = false;
      try {
        confirmed =
          JSON.stringify(paths(await tx.store.get(INDEX_KEY))) === JSON.stringify(nextPaths);
        for (const [path, bytes] of changes)
          confirmed = sameLibraryBytes(fileBytes(await tx.store.get(path)), bytes) && confirmed;
      } catch {
        confirmed = false;
      }
      if (!confirmed) {
        for (const [path, bytes] of before) await tx.store.put(bytes, path);
        await tx.store.put(beforeIndex, INDEX_KEY);
      }
      await done;
      if (!confirmed)
        throw new LibraryFault('corrupt', 'The coloring storage write could not be confirmed.');
    } catch (error) {
      await done.catch(() => undefined);
      throw libraryFault(error);
    }
  }
  async write(path: string, bytes: Uint8Array): Promise<void> {
    requireLibraryPath(path);
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_PACK_FILE_BYTES)
      throw new LibraryFault('corrupt', 'The coloring file is larger than expected.');
    const copy = new Uint8Array(bytes);
    await this.mutate(async () => new Map([[path, copy]]));
  }
  async move(from: string, to: string): Promise<void> {
    requireLibraryPath(from);
    requireLibraryPath(to);
    await this.mutate(async (tx, index) => {
      const bytes = fileBytes(await tx.store.get(from));
      if (!bytes || !index.includes(from))
        throw new LibraryFault('corrupt', 'A coloring file is missing.');
      return from === to
        ? new Map<string, Uint8Array | undefined>([[to, bytes]])
        : new Map<string, Uint8Array | undefined>([
            [to, bytes],
            [from, undefined],
          ]);
    });
  }
  async remove(prefix: string): Promise<void> {
    requireLibraryPath(prefix);
    await this.mutate(
      async (_tx, index) =>
        new Map<string, Uint8Array | undefined>(
          index
            .filter((path) => path === prefix || path.startsWith(`${prefix}/`))
            .map((path) => [path, undefined])
        )
    );
  }
  dispose() {
    this.disposed = true;
  }
}
