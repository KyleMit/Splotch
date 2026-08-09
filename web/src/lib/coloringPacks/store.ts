import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';

export interface InstalledColoringPack {
  id: string;
  rootPath?: string;
}

export interface ColoringPackStore {
  installed(manifest: ResolvedColoringPackManifest): Promise<InstalledColoringPack[]>;
  install(
    manifest: ResolvedColoringPackManifest,
    book: ResolvedColoringPackBookManifest,
    allowMetered: boolean,
    signal: AbortSignal
  ): Promise<InstalledColoringPack>;
  cancel(): Promise<void>;
  remove(manifest: ResolvedColoringPackManifest): Promise<void>;
  usage(manifest: ResolvedColoringPackManifest): Promise<number>;
}
