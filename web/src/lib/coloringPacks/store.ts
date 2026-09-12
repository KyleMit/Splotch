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
  // Only the app version: both implementations sweep every resolution, so a
  // caller has nothing to say about which one. Taking the whole manifest would
  // imply a network read that removal must not need — reclaiming space is the
  // operation most likely to be asked for while offline.
  remove(target: Pick<ResolvedColoringPackManifest, 'appVersion'>): Promise<void>;
  usage(manifest: ResolvedColoringPackManifest): Promise<number>;
}
