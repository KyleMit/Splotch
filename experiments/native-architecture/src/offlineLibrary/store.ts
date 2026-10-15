import { OFFLINE_BOOKS } from './books.generated';
import {
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
  hasBackgroundTransfers,
  type LibraryBackgroundPlatform,
  type LibraryFilePlatform,
  type LibraryPlatform,
} from './contract';
import { ART_VARIANT_SLUGS, type ArtOrientation } from '../drawing/paperSpace';

const PACK_DIRECTORY = /^([a-z]+)-([a-f0-9]{64})$/;
const stageName = (pack: Pack) => `staging-${packDirectory(pack)}`;
export const packDirectory = (pack: Pick<Pack, 'id' | 'revision'>) => `${pack.id}-${pack.revision}`;
const assetName = (file: PackFile) => `files/${file.path.split('/').at(-1)}`;
function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw new LibraryFault('cancelled', 'Coloring download cancelled.');
}
class LibraryStore {
  private transaction: Promise<unknown> = Promise.resolve();
  private launchCleaned = false;
  private readonly openedRevisions = new Set<string>();
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
  private async cleanInterruptedLaunch() {
    if (this.launchCleaned) return;
    for (const directory of await this.platform.list())
      if (directory.startsWith('staging-') && !(await this.validStage(directory)))
        await this.platform.remove(directory);
    this.launchCleaned = true;
  }
  private async validStage(directory: string) {
    const match = /^staging-([a-z]+)-([a-f0-9]{64})$/.exec(directory);
    if (!match || !OFFLINE_BOOKS.some((book) => book.id === match[1])) return false;
    try {
      const path = `${directory}/identity.json`;
      const identity = await this.platform.read(path, LIBRARY_TEXT_LIMIT_BYTES);
      return (
        identity !== null &&
        (await this.platform.verify(path, {
          path: '',
          downloadPath: '',
          bytes: identity.length,
          sha256: match[2],
        }))
      );
    } catch {
      return false;
    }
  }
  private async retireSuperseded(current: Pack) {
    for (const directory of await this.platform.list()) {
      if (directory.startsWith(`staging-${current.id}-`) && directory !== stageName(current)) {
        await this.platform.remove(directory);
        continue;
      }
      if (
        !PACK_DIRECTORY.test(directory) ||
        !directory.startsWith(`${current.id}-`) ||
        directory === packDirectory(current)
      )
        continue;
      if (!this.openedRevisions.has(directory)) {
        await this.platform.remove(directory);
        continue;
      }
      const old = await this.validPack(directory);
      if (!old) continue;
      await this.platform.write(
        `${directory}/retained.json`,
        encodeLibraryText(JSON.stringify(old))
      );
      await this.platform.move(`${directory}/installed.json`, `${directory}/withdrawn.json`);
    }
  }
  private async scanInstalled() {
    await this.cleanInterruptedLaunch();
    const directories = await this.platform.list();
    const installed: Pack[] = [];
    for (const directory of directories) {
      if (directory.startsWith('staging-')) continue;
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
        if (unpublished && unretained && !hasBackgroundTransfers(this.platform))
          await this.platform.remove(directory);
      }
    }
    return installed;
  }
  scan() {
    return this.serialize(() => this.scanInstalled());
  }
  inventory(currentCatalog: readonly Pack[]) {
    return this.serialize(async () => {
      await this.cleanInterruptedLaunch();
      for (const current of currentCatalog) await this.retireSuperseded(current);
      const revisions = new Set(currentCatalog.map((pack) => pack.revision));
      const installed = (await this.scanInstalled()).filter((pack) => revisions.has(pack.revision));
      return installed;
    });
  }
  private async downloadStaged(
    platform: LibraryFilePlatform,
    pack: Pack,
    staging: string,
    signal: AbortSignal,
    allowMetered: boolean,
    progress: (bytes: number) => void
  ) {
    const directory = packDirectory(pack);
    const verified = new Set<string>();
    let completed = 0;
    for (const file of pack.files) {
      cancelled(signal);
      const path = `${staging}/${assetName(file)}`;
      let valid = await this.platform.verify(path, file);
      if (!valid && (await this.platform.verify(`${directory}/${assetName(file)}`, file))) {
        await this.platform.move(`${directory}/${assetName(file)}`, path);
        valid = true;
      }
      if (valid) {
        verified.add(file.path);
        completed += file.bytes;
      }
    }
    const environment = await this.platform.environment();
    if (
      !Number.isFinite(environment.freeBytes) ||
      environment.freeBytes < pack.bytes - completed + LIBRARY_STORAGE_RESERVE_BYTES
    )
      throw new LibraryFault(
        'storage-full',
        'There is not enough free space for this coloring book.'
      );
    progress(completed);
    await this.writeIdentity(pack, staging);
    for (const file of pack.files) {
      cancelled(signal);
      if (verified.has(file.path)) continue;
      requireDownloadNetwork(await this.platform.environment(), allowMetered);
      cancelled(signal);
      const path = `${staging}/${assetName(file)}`;
      await platform.download(path, file, signal, allowMetered, (bytes) => {
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
  }
  private async writeIdentity(pack: Pack, staging: string) {
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
  }
  private async publishStaged(pack: Pack, staging: string, signal: AbortSignal) {
    const directory = packDirectory(pack);
    // Publication moves verified files first; cancellation never leaves a trusted marker.
    cancelled(signal);
    await this.platform.remove(directory);
    for (const file of pack.files) {
      cancelled(signal);
      await this.platform.move(`${staging}/${assetName(file)}`, `${directory}/${assetName(file)}`);
    }
    await this.platform.move(`${staging}/identity.json`, `${directory}/identity.json`);
    cancelled(signal);
    await this.retireSuperseded(pack);
    cancelled(signal);
    const marker = encodeLibraryText(JSON.stringify(pack));
    await this.platform.write(`${directory}/pending.json`, marker);
    cancelled(signal);
    await this.platform.move(`${directory}/pending.json`, `${directory}/installed.json`);
    if (signal.aborted) {
      await this.platform.remove(directory);
      cancelled(signal);
    }
  }
  install(
    pack: Pack,
    signal: AbortSignal,
    allowMetered: boolean,
    progress: (bytes: number) => void
  ) {
    const platform = this.platform;
    if (hasBackgroundTransfers(platform))
      return this.installBackground(platform, pack, signal, allowMetered, progress);
    return this.serialize(async () => {
      cancelled(signal);
      await this.cleanInterruptedLaunch();
      const directory = packDirectory(pack);
      const already = (await this.validPack(directory)) ?? (await this.validPack(directory, true));
      if (already) {
        await this.retireSuperseded(pack);
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
      const staging = stageName(pack);
      let published = false;
      try {
        await this.downloadStaged(platform, pack, staging, signal, allowMetered, progress);
        await this.publishStaged(pack, staging, signal);
        published = true;
        return pack;
      } finally {
        if (published) await this.platform.remove(staging).catch(() => undefined);
      }
    });
  }
  private async installBackground(
    platform: LibraryBackgroundPlatform,
    pack: Pack,
    signal: AbortSignal,
    allowMetered: boolean,
    progress: (bytes: number) => void
  ) {
    cancelled(signal);
    await platform.installPack(pack, signal, allowMetered, progress);
    return this.serialize(async () => {
      cancelled(signal);
      const installed = await this.validPack(packDirectory(pack));
      if (!installed)
        throw new LibraryFault(
          'corrupt',
          'The coloring download did not pass verification. Try again.'
        );
      await this.retireSuperseded(pack);
      progress(pack.bytes);
      return installed;
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
          'This picture’s coloring artwork is unavailable or damaged.'
        );
      const variant = async (orientation: ArtOrientation, dark: boolean) => {
        const basename = `${page.slug}-${ART_VARIANT_SLUGS[orientation]}`;
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
        };
      };
      const themes = async (orientation: ArtOrientation) => ({
        light: await variant(orientation, false),
        dark: await variant(orientation, true),
      });
      const artwork = { landscape: await themes('landscape'), portrait: await themes('portrait') };
      this.openedRevisions.add(directory);
      return artwork;
    });
  }
  cover(pack: Pack, dark: boolean) {
    return this.platform.uri(
      `${packDirectory(pack)}/files/cover.${dark ? 'chalk.' : ''}thumb.webp`
    );
  }
  selector(pack: Pack, page: OfflinePageSlug, orientation: ArtOrientation, dark: boolean) {
    const book = OFFLINE_BOOKS.find((book) => book.id === pack.id);
    if (!book?.pages.some((entry) => entry.slug === page))
      throw new LibraryFault('corrupt', 'Unknown coloring page.');
    return this.platform.uri(
      `${packDirectory(pack)}/files/${page}-${ART_VARIANT_SLUGS[orientation]}${dark ? '.dark' : ''}.selector.webp`
    );
  }
  remove() {
    return this.serialize(async () => {
      if (hasBackgroundTransfers(this.platform)) await this.platform.cancelInstallations();
      for (const directory of await this.platform.list()) {
        if (
          directory.startsWith('staging-') ||
          directory === 'transfers' ||
          PACK_DIRECTORY.test(directory)
        )
          await this.platform.remove(directory);
      }
      this.openedRevisions.clear();
    });
  }
  dispose() {
    this.platform.dispose();
  }
}
export function createLibraryStore(platform: LibraryPlatform) {
  return new LibraryStore(platform);
}
