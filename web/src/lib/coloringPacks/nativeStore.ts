import {
  ColoringPacks,
  nativeColoringPackRootUrl,
  type NativeColoringPack,
} from '$lib/plugins/coloringPacks';
import type { ColoringPackStore, InstalledColoringPack } from './store';

function resolvedPack(pack: NativeColoringPack): InstalledColoringPack {
  return { id: pack.id, rootPath: nativeColoringPackRootUrl(pack.rootPath) };
}

export function createNativeColoringPackStore(): ColoringPackStore {
  return {
    async installed(manifest) {
      const { installed } = await ColoringPacks.status({
        version: manifest.appVersion,
        bookIds: manifest.books.map((book) => book.id),
      });
      return installed.map(resolvedPack);
    },

    async install(manifest, book, allowMetered) {
      const pack = await ColoringPacks.install({
        version: manifest.appVersion,
        baseUrl: __NATIVE_API_BASE__,
        book,
        allowMetered,
      });
      return resolvedPack(pack);
    },

    async remove(manifest) {
      await ColoringPacks.remove({ version: manifest.appVersion });
    },

    async usage(manifest) {
      const { installed } = await ColoringPacks.status({
        version: manifest.appVersion,
        bookIds: manifest.books.map((book) => book.id),
      });
      const installedIds = new Set(installed.map((pack) => pack.id));
      return manifest.books
        .filter((book) => installedIds.has(book.id))
        .reduce((bytes, book) => bytes + book.bytes, 0);
    },
  };
}
