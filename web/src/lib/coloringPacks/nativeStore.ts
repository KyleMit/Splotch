import {
  ColoringPacks,
  nativeColoringPackRootUrl,
  type NativeColoringPack,
} from '$lib/plugins/coloringPacks';
import type { ColoringPackStore, InstalledColoringPack } from './store';
import { COLORING_PACK_RESOLUTIONS } from './resolution';

function storageVersion(manifest: Parameters<ColoringPackStore['installed']>[0]): string {
  return `${manifest.appVersion}-${manifest.resolution}`;
}

function resolvedPack(pack: NativeColoringPack): InstalledColoringPack {
  return { id: pack.id, rootPath: nativeColoringPackRootUrl(pack.rootPath) };
}

export function createNativeColoringPackStore(): ColoringPackStore {
  return {
    async installed(manifest) {
      const { installed } = await ColoringPacks.status({
        version: storageVersion(manifest),
        bookIds: manifest.books.map((book) => book.id),
      });
      return installed.map(resolvedPack);
    },

    async install(manifest, book, allowMetered) {
      const pack = await ColoringPacks.install({
        version: storageVersion(manifest),
        appVersion: manifest.appVersion,
        baseUrl: __NATIVE_API_BASE__,
        book,
        allowMetered,
      });
      return resolvedPack(pack);
    },

    async cancel() {
      await ColoringPacks.cancel();
    },

    async remove(manifest) {
      for (const resolution of COLORING_PACK_RESOLUTIONS) {
        await ColoringPacks.remove({ version: storageVersion({ ...manifest, resolution }) });
      }
    },

    async usage(manifest) {
      const { installed } = await ColoringPacks.status({
        version: storageVersion(manifest),
        bookIds: manifest.books.map((book) => book.id),
      });
      const installedIds = new Set(installed.map((pack) => pack.id));
      return manifest.books
        .filter((book) => installedIds.has(book.id))
        .reduce((bytes, book) => bytes + book.bytes, 0);
    },
  };
}
