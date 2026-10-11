import type { Directory, File } from 'expo-file-system';
import { NativeModules } from 'react-native';
import { approvedAssetUrl, type PackFile } from '../offlineLibrary/manifest';
import {
  LibraryFault,
  requireDownloadNetwork,
  type LibraryPlatform,
  type LibraryEnvironment,
} from '../offlineLibrary/contract';

interface NativeLibraryBridge {
  environment(): Promise<unknown>;
  verify(uri: string, bytes: number, sha256: string): Promise<unknown>;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isBridge(value: unknown): value is NativeLibraryBridge {
  return (
    record(value) && typeof value.environment === 'function' && typeof value.verify === 'function'
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

export const LIBRARY_FILE_TIMEOUT_MS = 60_000;
function transferSignal(signal: AbortSignal) {
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(new LibraryFault('cancelled', 'Coloring download cancelled.'));
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new LibraryFault('unavailable', 'The coloring download timed out. Try again.')
      ),
    LIBRARY_FILE_TIMEOUT_MS
  );
  return {
    signal: controller.signal,
    finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    },
  };
}

async function downloadFile(
  handle: ReturnType<File['open']>,
  expected: PackFile,
  signal: AbortSignal,
  allowMetered: boolean,
  environment: () => Promise<LibraryEnvironment>,
  progress: (bytes: number) => void
) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const transfer = transferSignal(signal);
  try {
    requireDownloadNetwork(await environment(), allowMetered);
    const url = approvedAssetUrl(expected.downloadPath);
    const { fetch } = await import('expo/fetch');
    const response = await fetch(url, {
      signal: transfer.signal,
      redirect: 'error',
      credentials: 'omit',
    });
    if (!response.ok || response.url !== url || !response.body)
      throw new LibraryFault(
        'unavailable',
        'This coloring book could not be downloaded. Try again later.'
      );
    const length = response.headers.get('content-length');
    const encoding = response.headers.get('content-encoding');
    if (
      length !== null &&
      (!encoding || encoding === 'identity') &&
      Number(length) !== expected.bytes
    )
      throw new LibraryFault(
        'corrupt',
        'The coloring download has changed. Please try again later.'
      );
    reader = response.body.getReader();
    let total = 0;
    while (true) {
      const chunk = await reader.read();
      if (transfer.signal.aborted)
        throw (
          transfer.signal.reason ?? new LibraryFault('cancelled', 'Coloring download cancelled.')
        );
      if (chunk.done) break;
      requireDownloadNetwork(await environment(), allowMetered);
      total += chunk.value.byteLength;
      if (total > expected.bytes)
        throw new LibraryFault('corrupt', 'The coloring download is larger than expected.');
      handle.writeBytes(chunk.value);
      progress(total);
    }
    if (total !== expected.bytes)
      throw new LibraryFault('corrupt', 'The coloring download is incomplete.');
  } finally {
    transfer.finish();
    await reader?.cancel().catch(() => undefined);
    handle.close();
  }
}

export function createLibraryPlatform(): LibraryPlatform {
  let root: Directory | null = null;
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
      const result = await bridge().environment();
      if (
        !record(result) ||
        typeof result.rootUri !== 'string' ||
        !result.rootUri.startsWith('file:///') ||
        typeof result.online !== 'boolean' ||
        typeof result.metered !== 'boolean'
      )
        throw storageUnavailable();
      filesystem ??= await import('expo-file-system');
      root = new filesystem.Directory(result.rootUri);
      root.create({ intermediates: true, idempotent: true });
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
      entry.write(bytes);
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
    async download(path: string, expected: PackFile, signal, allowMetered, progress) {
      ensureParent(path);
      const destination = file(path);
      destination.create();
      if (!filesystem) throw storageUnavailable();
      return downloadFile(
        destination.open(filesystem.FileMode.WriteOnly),
        expected,
        signal,
        allowMetered,
        () => this.environment(),
        progress
      );
    },
    dispose() {},
  };
}
