import {
  ColoringPacks,
  nativeColoringPackRootUrl,
  type NativeColoringPack,
  type NativeColoringPackBook,
} from '$lib/plugins/coloringPacks';
import { coloringPackMarkerValue } from './cacheKeys';
import type { ColoringPackStore, InstalledColoringPack } from './store';
import type { ResolvedColoringPackBookManifest } from './manifest';

// Native storage is keyed by resolution, not app version, so an app update
// keeps every book whose files it did not change (ADR-0103).
function nativeBook(book: ResolvedColoringPackBookManifest): NativeColoringPackBook {
  return { ...book, marker: coloringPackMarkerValue(book) };
}

function resolvedPack(pack: NativeColoringPack, bytes: number): InstalledColoringPack {
  return { id: pack.id, rootPath: nativeColoringPackRootUrl(pack.rootPath), bytes };
}

export function createNativeColoringPackStore(): ColoringPackStore {
  return {
    async installed(manifest) {
      const books = manifest.books.filter((book) => book.id !== manifest.starterBookId);
      const { installed } = await ColoringPacks.status({
        resolution: manifest.resolution,
        books: books.map(nativeBook),
      });
      const bytesByBookId = new Map(books.map((book) => [book.id, book.bytes]));
      return installed.map((pack) => resolvedPack(pack, bytesByBookId.get(pack.id) ?? 0));
    },

    async install(manifest, book, allowMetered) {
      const pack = await ColoringPacks.install({
        resolution: manifest.resolution,
        appVersion: manifest.appVersion,
        baseUrl: __NATIVE_API_BASE__,
        book: nativeBook(book),
        allowMetered,
      });
      return resolvedPack(pack, book.bytes);
    },

    async cancel() {
      await ColoringPacks.cancel();
    },

    async remove() {
      await ColoringPacks.remove();
    },
  };
}
