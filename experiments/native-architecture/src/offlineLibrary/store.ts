import { OFFLINE_BOOKS } from './books.generated';
import {
  isOfflinePageId,
  pageReference,
  parsePack,
  type Pack,
  type PackFile,
  type OfflinePageId,
  type OfflinePageSlug,
} from './manifest';
import {
  LibraryFault,
  LIBRARY_TEXT_LIMIT_BYTES,
  LIBRARY_STORAGE_RESERVE_BYTES,
  encodeLibraryText,
  decodeLibraryText,
  requireDownloadNetwork,
  type LibraryPlatform,
} from './contract';

const PACK_DIRECTORY = /^([a-z]+)-([a-f0-9]{64})$/;
const stageName = (id: string) =>
  `staging-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const packDirectory = (pack: Pick<Pack, 'id' | 'revision'>) => `${pack.id}-${pack.revision}`;
const assetName = (file: PackFile) => `files/${file.path.split('/').at(-1)}`;
function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw new LibraryFault('cancelled', 'Coloring download cancelled.');
}
class LibraryStore {
  private transaction: Promise<unknown> = Promise.resolve();
  constructor(private readonly platform: LibraryPlatform) {}
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.transaction.then(action, action);
    this.transaction = next.catch(() => undefined);
    return next;
  }
  private async validPack(directory: string, retained = false): Promise<Pack | null> {
    try {
      const marker = await this.platform.read(
        `${directory}/${retained ? 'retained' : 'installed'}.json`,
        LIBRARY_TEXT_LIMIT_BYTES
      );
      if (!marker) return null;
      const pack = parsePack(JSON.parse(decodeLibraryText(marker)));
      if (packDirectory(pack) !== directory) return null;
      const identity = encodeLibraryText(JSON.stringify(pack.files));
      const storedIdentity = await this.platform.read(
        `${directory}/identity.json`,
        LIBRARY_TEXT_LIMIT_BYTES
      );
      if (
        !storedIdentity ||
        decodeLibraryText(storedIdentity) !== decodeLibraryText(identity) ||
        !(await this.platform.verify(`${directory}/identity.json`, {
          path: '',
          downloadPath: '',
          bytes: identity.length,
          sha256: pack.revision,
        }))
      )
        return null;
      for (const file of pack.files)
        if (!(await this.platform.verify(`${directory}/${assetName(file)}`, file))) return null;
      return pack;
    } catch {
      return null;
    }
  }
  private async scanInstalled() {
    const directories = await this.platform.list();
    const installed: Pack[] = [];
    for (const directory of directories) {
      if (directory.startsWith('staging-')) {
        await this.platform.remove(directory);
        continue;
      }
      if (!PACK_DIRECTORY.test(directory)) continue;
      const pack = await this.validPack(directory);
      if (pack) installed.push(pack);
      else {
        const unpublished = await this.platform
          .read(`${directory}/installed.json`, LIBRARY_TEXT_LIMIT_BYTES)
          .then(
            (marker) => !marker,
            () => false
          );
        const unretained = await this.platform
          .read(`${directory}/retained.json`, LIBRARY_TEXT_LIMIT_BYTES)
          .then(
            (marker) => !marker,
            () => false
          );
        if (unpublished && unretained) await this.platform.remove(directory);
      }
    }
    return installed;
  }
  scan() {
    return this.serialize(() => this.scanInstalled());
  }
  inventory() {
    return this.serialize(async () => {
      const installed = await this.scanInstalled();
      const visible = new Set(installed.map(packDirectory));
      let retainedBytes = 0;
      for (const directory of await this.platform.list()) {
        if (!PACK_DIRECTORY.test(directory) || visible.has(directory)) continue;
        const retained = await this.validPack(directory, true);
        if (retained) retainedBytes += retained.bytes;
      }
      return { installed, retainedBytes };
    });
  }
  install(
    pack: Pack,
    signal: AbortSignal,
    allowMetered: boolean,
    progress: (bytes: number) => void
  ) {
    return this.serialize(async () => {
      cancelled(signal);
      const environment = await this.platform.environment();
      if (
        !Number.isFinite(environment.freeBytes) ||
        environment.freeBytes < pack.bytes + LIBRARY_STORAGE_RESERVE_BYTES
      )
        throw new LibraryFault(
          'storage-full',
          'There is not enough free space for this coloring book.'
        );
      const directory = packDirectory(pack);
      const already = (await this.validPack(directory)) ?? (await this.validPack(directory, true));
      if (already) {
        cancelled(signal);
        await this.platform.write(
          `${directory}/pending.json`,
          encodeLibraryText(JSON.stringify(already))
        );
        cancelled(signal);
        await this.platform.move(`${directory}/pending.json`, `${directory}/installed.json`);
        if (signal.aborted) {
          await this.platform.move(`${directory}/installed.json`, `${directory}/withdrawn.json`);
          cancelled(signal);
        }
        return already;
      }
      const staging = stageName(pack.id);
      try {
        let completed = 0;
        for (const file of pack.files) {
          cancelled(signal);
          requireDownloadNetwork(await this.platform.environment(), allowMetered);
          cancelled(signal);
          const path = `${staging}/${assetName(file)}`;
          await this.platform.download(path, file, signal, allowMetered, (bytes) => {
            if (!signal.aborted) progress(completed + Math.min(bytes, file.bytes));
          });
          cancelled(signal);
          if (!(await this.platform.verify(path, file)))
            throw new LibraryFault(
              'corrupt',
              'The coloring download did not pass verification. Try again.'
            );
          completed += file.bytes;
          progress(completed);
        }
        cancelled(signal);
        const identity = encodeLibraryText(JSON.stringify(pack.files));
        await this.platform.write(`${staging}/identity.json`, identity);
        if (
          !(await this.platform.verify(`${staging}/identity.json`, {
            path: '',
            downloadPath: '',
            bytes: identity.length,
            sha256: pack.revision,
          }))
        )
          throw new LibraryFault('corrupt', 'The coloring catalog did not pass verification.');
        // Publication moves verified files first; cancellation never leaves a trusted marker.
        cancelled(signal);
        await this.platform.remove(directory);
        for (const file of pack.files) {
          cancelled(signal);
          await this.platform.move(
            `${staging}/${assetName(file)}`,
            `${directory}/${assetName(file)}`
          );
        }
        await this.platform.move(`${staging}/identity.json`, `${directory}/identity.json`);
        cancelled(signal);
        const marker = encodeLibraryText(JSON.stringify(pack));
        await this.platform.write(`${directory}/pending.json`, marker);
        cancelled(signal);
        await this.platform.move(`${directory}/pending.json`, `${directory}/installed.json`);
        if (signal.aborted) {
          await this.platform.remove(directory);
          cancelled(signal);
        }
        return pack;
      } finally {
        await this.platform.remove(staging).catch(() => undefined);
      }
    });
  }
  openPage(id: OfflinePageId) {
    return this.serialize(async () => {
      const { book, page, revision } = pageReference(id);
      const directory = `${book.id}-${revision}`;
      const pack = (await this.validPack(directory)) ?? (await this.validPack(directory, true));
      if (!pack)
        throw new LibraryFault(
          'corrupt',
          'This picture’s coloring artwork is unavailable or damaged. Your saved picture is unchanged.'
        );
      const theme = async (dark: boolean) => {
        const basename = `${page.slug}-wide`;
        const outline = await this.platform.read(
          `${directory}/files/${basename}${dark ? '.dark' : ''}.overlay.svg`,
          LIBRARY_TEXT_LIMIT_BYTES
        );
        if (!outline) throw new LibraryFault('corrupt', 'This coloring artwork is incomplete.');
        return {
          outline: decodeLibraryText(outline),
          fill: this.platform.uri(
            `${directory}/files/${basename}.${dark ? 'night' : 'light'}.webp`
          ),
          selector: this.platform.uri(
            `${directory}/files/${basename}${dark ? '.dark' : ''}.selector.webp`
          ),
        };
      };
      return { light: await theme(false), dark: await theme(true) };
    });
  }
  cover(pack: Pack, dark: boolean) {
    return this.platform.uri(
      `${packDirectory(pack)}/files/cover.${dark ? 'chalk.' : ''}thumb.webp`
    );
  }
  selector(pack: Pack, page: OfflinePageSlug, dark: boolean) {
    const book = OFFLINE_BOOKS.find((book) => book.id === pack.id);
    if (!book?.pages.some((entry) => entry.slug === page))
      throw new LibraryFault('corrupt', 'Unknown coloring page.');
    return this.platform.uri(
      `${packDirectory(pack)}/files/${page}-wide${dark ? '.dark' : ''}.selector.webp`
    );
  }
  withSavedArtwork<T>(id: string, action: () => Promise<T>) {
    return this.serialize(async () => {
      if (isOfflinePageId(id)) {
        const { book, revision } = pageReference(id);
        const directory = `${book.id}-${revision}`;
        if (!(await this.validPack(directory)) && !(await this.validPack(directory, true)))
          throw new LibraryFault(
            'corrupt',
            'The coloring artwork could not be saved safely. Please try again.'
          );
      }
      return action();
    });
  }
  remove(getProtectedPages: () => Promise<readonly string[]>) {
    return this.serialize(async () => {
      const protectedPages = await getProtectedPages();
      const keep = new Set(
        protectedPages.filter(isOfflinePageId).map((id) => {
          const { book, revision } = pageReference(id);
          return `${book.id}-${revision}`;
        })
      );
      const protectedPacks = new Map<string, Pack>();
      for (const directory of keep) {
        const pack = (await this.validPack(directory)) ?? (await this.validPack(directory, true));
        if (!pack)
          throw new LibraryFault(
            'corrupt',
            'Saved coloring artwork could not be checked. Your coloring books were kept.'
          );
        protectedPacks.set(directory, pack);
      }
      let retainedBytes = 0;
      for (const directory of await this.platform.list()) {
        if (directory.startsWith('staging-')) {
          await this.platform.remove(directory);
          continue;
        }
        if (!PACK_DIRECTORY.test(directory)) continue;
        const pack = protectedPacks.get(directory);
        if (pack) {
          await this.platform.write(
            `${directory}/retained.json`,
            encodeLibraryText(JSON.stringify(pack))
          );
          const marker = await this.platform.read(
            `${directory}/installed.json`,
            LIBRARY_TEXT_LIMIT_BYTES
          );
          if (marker)
            await this.platform.move(`${directory}/installed.json`, `${directory}/withdrawn.json`);
          retainedBytes += pack.bytes;
        } else await this.platform.remove(directory);
      }
      return retainedBytes;
    });
  }
  dispose() {
    this.platform.dispose();
  }
}
export function createLibraryStore(platform: LibraryPlatform) {
  return new LibraryStore(platform);
}
