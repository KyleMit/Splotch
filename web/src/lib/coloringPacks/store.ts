import type { ColoringPackBookManifest, ColoringPackManifest } from './manifest';

export interface InstalledColoringPack {
  id: string;
  rootPath?: string;
}

export interface ColoringPackStore {
  installed(manifest: ColoringPackManifest): Promise<InstalledColoringPack[]>;
  install(
    manifest: ColoringPackManifest,
    book: ColoringPackBookManifest,
    allowMetered: boolean,
    signal: AbortSignal
  ): Promise<InstalledColoringPack>;
  remove(manifest: ColoringPackManifest): Promise<void>;
  usage(manifest: ColoringPackManifest): Promise<number>;
}
