import { scheduleIdle } from '$lib/idle';
import {
  isInvariantColoringPackAssetPath,
  type ResolvedColoringPackBookManifest,
  type ResolvedColoringPackManifest,
} from './manifest';
import type { ColoringPackStore, InstalledColoringPack } from './store';
import {
  COLORING_PACK_CACHE_FAMILY_PREFIX,
  COLORING_PACK_LOCK_NAME,
  COLORING_PACK_MARKER_PREFIX,
  coloringPackCacheName,
  coloringPackMarkerPath,
  coloringPackMarkerValue,
} from './cacheKeys';

type ColoringPackFile = ResolvedColoringPackBookManifest['files'][number];

// A commit that finds a file missing or replaced (another tab, or bytes an
// interrupted scan never checked) downloads the gap once more; a second
// failure means another build is rewriting the same book, so the run pauses.
const INSTALL_COMMIT_ATTEMPTS = 2;

// Tabs on different builds share one cache during a deploy, and a scan from
// one can delete what another is about to vouch for, so every step that reads
// markers or writes one runs under a cross-tab lock. Web Locks are within the
// browser floor (docs/COMPATIBILITY.md); an insecure origin lacks them, and
// there the chain still serializes this tab's own stores.
function createPackCacheLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
      return navigator.locks.request(COLORING_PACK_LOCK_NAME, work);
    }
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  };
}

const withPackCacheLock = createPackCacheLock();

function nextIdle(): Promise<void> {
  return new Promise((resolve) => scheduleIdle(resolve));
}

async function waitForIdle(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cancel();
      reject(signal.reason);
    };
    const cancel = scheduleIdle(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function digestHex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function matchesManifest(bytes: ArrayBuffer, file: ColoringPackFile): Promise<boolean> {
  return bytes.byteLength === file.bytes && (await digestHex(bytes)) === file.sha256;
}

function coloringAssetContentType(path: string): string {
  return isInvariantColoringPackAssetPath(path) ? 'image/svg+xml' : 'image/webp';
}

function packBooks(manifest: ResolvedColoringPackManifest): ResolvedColoringPackBookManifest[] {
  return manifest.books.filter((book) => book.id !== manifest.starterBookId);
}

async function verifiedResponse(file: ColoringPackFile, signal: AbortSignal): Promise<Response> {
  const response = await fetch(file.downloadPath, { cache: 'no-store', signal });
  if (!response.ok)
    throw new Error(`Coloring asset download failed (${response.status}): ${file.downloadPath}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== file.bytes) {
    throw new Error(`Coloring asset byte count mismatch: ${file.path}`);
  }
  if ((await digestHex(bytes)) !== file.sha256) {
    throw new Error(`Coloring asset digest mismatch: ${file.path}`);
  }
  return new Response(bytes, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? coloringAssetContentType(file.path),
    },
  });
}

async function hasVerifiedCachedFile(cache: Cache, file: ColoringPackFile): Promise<boolean> {
  const response = await cache.match(file.path);
  if (!response) return false;
  if (await matchesManifest(await response.arrayBuffer(), file)) return true;
  await cache.delete(file.path);
  return false;
}

async function markIfComplete(
  cache: Cache,
  book: ResolvedColoringPackBookManifest,
  verifiedPaths: ReadonlySet<string> = new Set()
): Promise<boolean> {
  let complete = true;
  for (const file of book.files) {
    if (!verifiedPaths.has(file.path) && !(await hasVerifiedCachedFile(cache, file))) {
      complete = false;
    }
  }
  if (complete) {
    await cache.put(coloringPackMarkerPath(book.id), new Response(coloringPackMarkerValue(book)));
  }
  return complete;
}

// A marker is trusted by its value alone, so every marker the manifest does
// not match is deleted before any file it vouched for can be removed or
// replaced. Otherwise an interrupted scan could leave a marker that a later
// manifest (a revert) matches again while its files are gone.
async function removeStaleEntries(
  cache: Cache,
  manifest: ResolvedColoringPackManifest
): Promise<Set<string>> {
  const booksByMarkerPath = new Map(
    packBooks(manifest).map((book) => [coloringPackMarkerPath(book.id), book])
  );
  const listedPaths = new Set(
    manifest.books.flatMap((book) => book.files.map((file) => file.path))
  );
  const staleBookIds = new Set<string>();
  const unlistedFiles: Request[] = [];
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(COLORING_PACK_MARKER_PREFIX)) {
      if (!listedPaths.has(path)) unlistedFiles.push(request);
      continue;
    }
    const book = booksByMarkerPath.get(path);
    const marker = await cache.match(request);
    if (book && (await marker?.text()) === coloringPackMarkerValue(book)) continue;
    await cache.delete(request);
    if (book) staleBookIds.add(book.id);
  }
  await Promise.all(unlistedFiles.map((request) => cache.delete(request)));
  return staleBookIds;
}

// A scan that throws hides every downloaded book for the session, and a
// persistent failure (a full disk) would hide them on every boot, so a book
// that cannot be re-verified is left unmarked for install() to repair.
async function reverifyStaleBooks(
  cache: Cache,
  manifest: ResolvedColoringPackManifest,
  staleBookIds: ReadonlySet<string>
) {
  for (const book of packBooks(manifest)) {
    if (!staleBookIds.has(book.id)) continue;
    try {
      await markIfComplete(cache, book);
    } catch (error) {
      console.warn('Coloring pack could not be re-verified', book.id, error);
    }
  }
}

// Moves rather than copies, one file at a time, so a slow or interrupted
// adoption holds at most one file twice; whatever it has not reached stays in
// the source cache for the next scan. A copy that cannot be written (a full
// disk) is discarded rather than retried on every boot: it can be downloaded
// again, and dropping it frees the space the failure asked for.
async function moveVerifiedFile(
  cache: Cache,
  source: Cache,
  file: ColoringPackFile
): Promise<boolean> {
  const response = await source.match(file.path);
  if (!response) return false;
  const moved = await writeIfVerified(cache, file, response);
  await source.delete(file.path).catch(() => false);
  return moved;
}

async function writeIfVerified(
  cache: Cache,
  file: ColoringPackFile,
  response: Response
): Promise<boolean> {
  try {
    if (!(await matchesManifest(await response.clone().arrayBuffer(), file))) return false;
    await cache.put(file.path, response);
    return true;
  } catch (error) {
    console.warn('Coloring pack file could not be adopted', file.path, error);
    return false;
  }
}

// Checks completeness even when nothing moved: a scan interrupted between a
// book's last move and its marker leaves every file in the current cache and
// none in the source, and the source is deleted once this drain finishes.
async function adoptBook(cache: Cache, source: Cache, book: ResolvedColoringPackBookManifest) {
  if (await cache.match(coloringPackMarkerPath(book.id))) return;
  const moved = new Set<string>();
  for (const file of book.files) {
    if (await moveVerifiedFile(cache, source, file)) moved.add(file.path);
  }
  try {
    await markIfComplete(cache, book, moved);
  } catch (error) {
    console.warn('Coloring pack could not be marked after adoption', book.id, error);
  }
}

// Drains every other pack cache — a version-scoped one from the earlier store
// layout, or the other resolution — into the current cache, keeping each file
// whose bytes the manifest still lists. It yields once per book rather than
// per file: Safari's idle fallback requeues while a child is drawing, and
// hundreds of per-file waits could keep books hidden for a whole session.
async function adoptOtherCaches(cache: Cache, manifest: ResolvedColoringPackManifest) {
  const currentName = coloringPackCacheName(manifest);
  const otherNames = (await caches.keys()).filter(
    (name) => name.startsWith(COLORING_PACK_CACHE_FAMILY_PREFIX) && name !== currentName
  );
  for (const name of otherNames) {
    const source = await caches.open(name);
    for (const book of packBooks(manifest)) {
      await nextIdle();
      await withPackCacheLock(() => adoptBook(cache, source, book));
    }
    await withPackCacheLock(() => caches.delete(name)).catch(() => false);
  }
}

async function booksWithCurrentMarkers(
  cache: Cache,
  manifest: ResolvedColoringPackManifest
): Promise<InstalledColoringPack[]> {
  const installed: InstalledColoringPack[] = [];
  for (const book of packBooks(manifest)) {
    const marker = await cache.match(coloringPackMarkerPath(book.id));
    if ((await marker?.text()) === coloringPackMarkerValue(book)) {
      installed.push({ id: book.id, bytes: book.bytes });
    }
  }
  return installed;
}

export function createWebColoringPackStore(): ColoringPackStore {
  return {
    async installed(manifest): Promise<InstalledColoringPack[]> {
      const cache = await caches.open(coloringPackCacheName(manifest));
      await withPackCacheLock(async () => {
        const staleBookIds = await removeStaleEntries(cache, manifest);
        await reverifyStaleBooks(cache, manifest, staleBookIds);
      });
      await adoptOtherCaches(cache, manifest);
      return withPackCacheLock(() => booksWithCurrentMarkers(cache, manifest));
    },

    // Automatic pack installs share the default boot path, so requesting origin
    // persistence here would prompt Firefox on startup (ADR-0128).
    async install(manifest, book, _allowMetered, signal) {
      const cache = await caches.open(coloringPackCacheName(manifest));
      for (let attempt = 1; ; attempt++) {
        for (const file of book.files) {
          if (signal.aborted) throw signal.reason;
          if (await cache.match(file.path)) continue;
          await waitForIdle(signal);
          await cache.put(file.path, await verifiedResponse(file, signal));
        }
        if (signal.aborted) throw signal.reason;
        if (await withPackCacheLock(() => markIfComplete(cache, book))) break;
        if (attempt >= INSTALL_COMMIT_ATTEMPTS) {
          throw new Error(`Coloring pack changed while installing: ${book.id}`);
        }
      }
      return { id: book.id, bytes: book.bytes };
    },

    // Web transfers abort through the AbortSignal install() already receives.
    async cancel() {},

    // The web cache is not scoped by app version, so removal clears every pack
    // cache, including one an earlier layout left undrained.
    async remove() {
      await withPackCacheLock(async () => {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith(COLORING_PACK_CACHE_FAMILY_PREFIX))
            .map((name) => caches.delete(name))
        );
      });
    },
  };
}
