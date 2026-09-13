import { scheduleIdle } from '$lib/idle';
import {
  isInvariantColoringPackAssetPath,
  type ResolvedColoringPackBookManifest,
  type ResolvedColoringPackManifest,
} from './manifest';
import type { ColoringPackStore, InstalledColoringPack } from './store';
import {
  COLORING_PACK_CACHE_FAMILY_PREFIX,
  COLORING_PACK_MARKER_PREFIX,
  coloringPackCacheName,
  coloringPackMarkerPath,
  coloringPackMarkerValue,
} from './cacheKeys';

type ColoringPackFile = ResolvedColoringPackBookManifest['files'][number];

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
): Promise<void> {
  let complete = true;
  for (const file of book.files) {
    if (!verifiedPaths.has(file.path) && !(await hasVerifiedCachedFile(cache, file))) {
      complete = false;
    }
  }
  if (complete) {
    await cache.put(coloringPackMarkerPath(book.id), new Response(coloringPackMarkerValue(book)));
  }
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

// Moves rather than copies, one file at a time, so a slow or interrupted
// adoption holds at most one file twice; whatever it has not reached stays in
// the source cache for the next scan.
async function moveVerifiedFile(
  cache: Cache,
  source: Cache,
  file: ColoringPackFile
): Promise<boolean> {
  const response = await source.match(file.path);
  if (!response) return false;
  await nextIdle();
  const verified = await matchesManifest(await response.clone().arrayBuffer(), file);
  if (verified) await cache.put(file.path, response);
  await source.delete(file.path);
  return verified;
}

// Drains every other pack cache — a version-scoped one from the earlier store
// layout, or the other resolution — into the current cache, keeping each file
// whose bytes the manifest still lists.
async function adoptOtherCaches(cache: Cache, manifest: ResolvedColoringPackManifest) {
  const currentName = coloringPackCacheName(manifest);
  const otherNames = (await caches.keys()).filter(
    (name) => name.startsWith(COLORING_PACK_CACHE_FAMILY_PREFIX) && name !== currentName
  );
  for (const name of otherNames) {
    const source = await caches.open(name);
    for (const book of packBooks(manifest)) {
      if (await cache.match(coloringPackMarkerPath(book.id))) continue;
      const moved = new Set<string>();
      for (const file of book.files) {
        if (await moveVerifiedFile(cache, source, file)) moved.add(file.path);
      }
      if (moved.size > 0) await markIfComplete(cache, book, moved);
    }
    await caches.delete(name);
  }
}

export function createWebColoringPackStore(): ColoringPackStore {
  return {
    async installed(manifest): Promise<InstalledColoringPack[]> {
      const cache = await caches.open(coloringPackCacheName(manifest));
      const staleBookIds = await removeStaleEntries(cache, manifest);
      await adoptOtherCaches(cache, manifest);
      const installed: InstalledColoringPack[] = [];
      for (const book of packBooks(manifest)) {
        const markerPath = coloringPackMarkerPath(book.id);
        if (staleBookIds.has(book.id) && !(await cache.match(markerPath))) {
          await markIfComplete(cache, book);
        }
        if (await cache.match(markerPath)) installed.push({ id: book.id, bytes: book.bytes });
      }
      return installed;
    },

    // Automatic pack installs share the default boot path, so requesting origin
    // persistence here would prompt Firefox on startup (ADR-0128).
    async install(manifest, book, _allowMetered, signal) {
      const cache = await caches.open(coloringPackCacheName(manifest));
      for (const file of book.files) {
        if (signal.aborted) throw signal.reason;
        if (await hasVerifiedCachedFile(cache, file)) continue;
        await waitForIdle(signal);
        await cache.put(file.path, await verifiedResponse(file, signal));
      }
      await cache.put(coloringPackMarkerPath(book.id), new Response(coloringPackMarkerValue(book)));
      return { id: book.id, bytes: book.bytes };
    },

    // Web transfers abort through the AbortSignal install() already receives.
    async cancel() {},

    // The web cache is not scoped by app version, so removal clears every pack
    // cache, including one an earlier layout left undrained.
    async remove() {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(COLORING_PACK_CACHE_FAMILY_PREFIX))
          .map((name) => caches.delete(name))
      );
    },
  };
}
