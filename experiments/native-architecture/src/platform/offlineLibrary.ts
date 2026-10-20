import type { Directory, File } from 'expo-file-system';
import { NativeModules } from 'react-native';
import { approvedAssetUrl, parsePack } from '../offlineLibrary/manifest';
import { LibraryFault, type LibraryBackgroundPlatform } from '../offlineLibrary/contract';

interface NativeLibraryBridge {
  environment(): Promise<unknown>;
  verify(uri: string, bytes: number, sha256: string): Promise<unknown>;
  install(pack: string, identity: string, allowMetered: boolean): Promise<unknown>;
  cancelAll(): Promise<unknown>;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isBridge(value: unknown): value is NativeLibraryBridge {
  return (
    record(value) &&
    typeof value.environment === 'function' &&
    typeof value.verify === 'function' &&
    typeof value.install === 'function' &&
    typeof value.cancelAll === 'function'
  );
}
const safePath = (path: string) =>
  /^[a-z0-9/-]+(?:\.[a-z0-9.-]+)?$/.test(path) &&
  !path.includes('..') &&
  !path.startsWith('/') &&
  !path.endsWith('/');

const storageUnavailable = () =>
  new LibraryFault('unavailable', 'Coloring storage is unavailable.');

function bridge() {
  const candidate: unknown = NativeModules.SplotchLibraryEnvironment;
  if (!isBridge(candidate))
    throw new LibraryFault('unavailable', 'Coloring downloads are unavailable in this app build.');
  return candidate;
}

async function cancelNativeInstallations(native: NativeLibraryBridge) {
  if ((await native.cancelAll()) !== true) throw storageUnavailable();
}

async function nativeEnvironment() {
  const result = await bridge().environment();
  if (
    !record(result) ||
    typeof result.rootUri !== 'string' ||
    !result.rootUri.startsWith('file:///') ||
    typeof result.online !== 'boolean' ||
    typeof result.metered !== 'boolean'
  )
    throw storageUnavailable();
  return { rootUri: result.rootUri, online: result.online, metered: result.metered };
}

export function createLibraryPlatform(): LibraryBackgroundPlatform {
  let root: Directory | null = null;
  let rootUri: string | null = null;
  let filesystem: typeof import('expo-file-system') | null = null;
  function file(path: string): File {
    if (!root || !filesystem || !safePath(path)) throw storageUnavailable();
    return new filesystem.File(root, path);
  }
  function ensureParent(path: string) {
    if (!root || !filesystem || !safePath(path)) throw storageUnavailable();
    const parent = path.slice(0, path.lastIndexOf('/'));
    if (parent)
      new filesystem.Directory(root, parent).create({ intermediates: true, idempotent: true });
  }
  return {
    async environment() {
      const result = await nativeEnvironment();
      if (rootUri && result.rootUri !== rootUri) throw storageUnavailable();
      filesystem ??= await import('expo-file-system');
      if (!root) {
        root = new filesystem.Directory(result.rootUri);
        root.create({ intermediates: true, idempotent: true });
        rootUri = result.rootUri;
      }
      return {
        online: result.online,
        metered: result.metered,
        freeBytes: filesystem.Paths.availableDiskSpace,
      };
    },
    async list() {
      if (!root) await this.environment();
      if (!root || !filesystem) return [];
      const { Directory } = filesystem;
      return root
        .list()
        .filter((entry) => entry instanceof Directory)
        .map((entry) => entry.name);
    },
    async read(path, limit) {
      const entry = file(path);
      if (!entry.exists) return null;
      if (entry.size > limit)
        throw new LibraryFault('corrupt', 'A coloring file is damaged. Download the book again.');
      return entry.bytes();
    },
    async write(path, bytes) {
      ensureParent(path);
      const entry = file(path);
      if (!entry.exists) entry.create();
      await entry.write(bytes);
    },
    async remove(prefix) {
      if (!root || !filesystem || !safePath(prefix))
        throw new LibraryFault('unavailable', 'Invalid coloring storage path.');
      const entry = new filesystem.Directory(root, prefix);
      if (entry.exists) entry.delete();
    },
    async move(from, to) {
      ensureParent(to);
      await file(from).move(file(to), { overwrite: true });
    },
    uri(path) {
      return file(path).uri;
    },
    async verify(path, expected) {
      return (await bridge().verify(file(path).uri, expected.bytes, expected.sha256)) === true;
    },
    async installPack(pack, signal, allowMetered, progress) {
      const snapshot = parsePack(pack);
      for (const asset of snapshot.files) approvedAssetUrl(asset.downloadPath);
      if (signal.aborted) throw new LibraryFault('cancelled', 'Coloring download cancelled.');
      const native = bridge();
      let cancellation: Promise<void> | null = null;
      const cancel = () => {
        cancellation ??= cancelNativeInstallations(native);
        void cancellation.catch(() => undefined);
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const completed = await native.install(
          JSON.stringify(snapshot),
          JSON.stringify(snapshot.files),
          allowMetered
        );
        if (signal.aborted) throw new LibraryFault('cancelled', 'Coloring download cancelled.');
        if (completed !== true) throw storageUnavailable();
        progress(snapshot.bytes);
      } catch (error) {
        if (signal.aborted) throw new LibraryFault('cancelled', 'Coloring download cancelled.');
        if (record(error) && error.code === 'library_metered')
          throw new LibraryFault(
            'metered',
            'Waiting for Wi-Fi. You can allow mobile data for coloring downloads.'
          );
        if (record(error) && error.code === 'library_storage_full')
          throw new LibraryFault(
            'storage-full',
            'There is not enough free space for this coloring book.'
          );
        throw error;
      } finally {
        signal.removeEventListener('abort', cancel);
        await cancellation;
      }
    },
    async cancelInstallations() {
      await cancelNativeInstallations(bridge());
    },
    dispose() {},
  };
}
