import type { Pack, PackFile } from './manifest';

export type LibraryFaultCode =
  'offline' | 'metered' | 'storage-full' | 'corrupt' | 'unavailable' | 'cancelled';
export class LibraryFault extends Error {
  constructor(
    public readonly code: LibraryFaultCode,
    message: string
  ) {
    super(message);
  }
}
export type LibraryEnvironment = Readonly<{ online: boolean; metered: boolean; freeBytes: number }>;
interface LibraryStorage {
  environment(): Promise<LibraryEnvironment>;
  list(): Promise<readonly string[]>;
  read(path: string, maxBytes: number): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(prefix: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  uri(path: string): string;
  verify(path: string, file: PackFile): Promise<boolean>;
  setDrawing?(drawing: boolean): void;
  dispose(): void;
}
export interface LibraryFilePlatform extends LibraryStorage {
  download(
    path: string,
    file: PackFile,
    signal: AbortSignal,
    allowMetered: boolean,
    progress: (bytes: number) => void
  ): Promise<void>;
}
export interface LibraryBackgroundPlatform extends LibraryStorage {
  installPack(
    pack: Pack,
    signal: AbortSignal,
    allowMetered: boolean,
    progress: (bytes: number) => void
  ): Promise<void>;
  cancelInstallations(): Promise<void>;
}
export type LibraryPlatform = LibraryFilePlatform | LibraryBackgroundPlatform;
export function hasBackgroundTransfers(
  platform: LibraryPlatform
): platform is LibraryBackgroundPlatform {
  return 'installPack' in platform;
}
export const LIBRARY_TEXT_LIMIT_BYTES = 128 * 1024;
export const LIBRARY_STORAGE_RESERVE_BYTES = 8 * 1024 * 1024;
export const encodeLibraryText = (text: string) => new TextEncoder().encode(text);
export const decodeLibraryText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

export function requireDownloadNetwork(
  environment: Pick<LibraryEnvironment, 'online' | 'metered'>,
  allowMetered: boolean
) {
  if (!environment.online)
    throw new LibraryFault(
      'offline',
      'Coloring downloads are waiting for a connection. Try again when this device is online.'
    );
  if (environment.metered && !allowMetered)
    throw new LibraryFault(
      'metered',
      'Waiting for Wi-Fi. You can allow mobile data for coloring downloads.'
    );
}
