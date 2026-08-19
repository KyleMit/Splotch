import { scheduleIdle } from '$lib/idle';
import { requestPersistentStorage } from '$lib/idb';
import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';
import type { ColoringPackStore, InstalledColoringPack } from './store';
import { COLORING_PACK_RESOLUTIONS } from './resolution';
import {
  COLORING_PACK_CACHE_PREFIX,
  coloringPackCacheName,
  coloringPackMarkerPath,
} from './cacheKeys';

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

async function verifiedResponse(
  file: ResolvedColoringPackBookManifest['files'][number],
  signal: AbortSignal
): Promise<Response> {
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
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'image/webp' },
  });
}

async function deleteOldCaches(currentName: string) {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(COLORING_PACK_CACHE_PREFIX) && name !== currentName)
      .map((name) => caches.delete(name))
  );
}

async function hasCompleteBook(
  cache: Cache,
  manifest: ResolvedColoringPackManifest,
  book: ResolvedColoringPackBookManifest
): Promise<boolean> {
  const markerPath = coloringPackMarkerPath(manifest, book.id);
  if (!(await cache.match(markerPath))) return false;
  const cachedFiles = await Promise.all(book.files.map((file) => cache.match(file.path)));
  const complete = cachedFiles.every((response) => !!response);
  if (!complete) await cache.delete(markerPath);
  return complete;
}

export function createWebColoringPackStore(): ColoringPackStore {
  return {
    async installed(manifest): Promise<InstalledColoringPack[]> {
      const name = coloringPackCacheName(manifest);
      await deleteOldCaches(name);
      const cache = await caches.open(name);
      const installed = await Promise.all(
        manifest.books
          .filter((book) => book.id !== manifest.starterBookId)
          .map(async (book) =>
            (await hasCompleteBook(cache, manifest, book)) ? { id: book.id } : null
          )
      );
      return installed.filter((pack): pack is InstalledColoringPack => !!pack);
    },

    async install(manifest, book, _allowMetered, signal) {
      await requestPersistentStorage();
      const cache = await caches.open(coloringPackCacheName(manifest));
      for (const file of book.files) {
        if (signal.aborted) throw signal.reason;
        if (await cache.match(file.path)) continue;
        await waitForIdle(signal);
        await cache.put(file.path, await verifiedResponse(file, signal));
      }
      await cache.put(coloringPackMarkerPath(manifest, book.id), new Response(book.id));
      return { id: book.id };
    },

    // Web transfers abort through the AbortSignal install() already receives.
    async cancel() {},

    async remove(manifest) {
      await Promise.all(
        COLORING_PACK_RESOLUTIONS.map((resolution) =>
          caches.delete(coloringPackCacheName({ ...manifest, resolution }))
        )
      );
    },

    async usage(manifest) {
      const cache = await caches.open(coloringPackCacheName(manifest));
      const installed = await Promise.all(
        manifest.books.map(async (book) =>
          (await cache.match(coloringPackMarkerPath(manifest, book.id))) ? book.bytes : 0
        )
      );
      return installed.reduce((sum, bytes) => sum + bytes, 0);
    },
  };
}
