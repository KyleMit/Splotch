import type { ResolvedColoringPackBookManifest, ResolvedColoringPackManifest } from './manifest';

export interface InstalledColoringPack {
  id: string;
  // Size on disk of the variant the scan was asked about. Carried on the pack
  // so discovering what is installed and totalling what it costs are one
  // answer: they were two, and every boot paid for the same work twice.
  bytes: number;
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
  // No manifest: neither store is scoped by app version and both remove every
  // resolution, so removal needs no network read — reclaiming space is the
  // operation most likely to be asked for while offline.
  remove(): Promise<void>;
}
