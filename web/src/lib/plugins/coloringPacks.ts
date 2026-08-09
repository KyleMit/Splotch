import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ResolvedColoringPackBookManifest } from '$lib/coloringPacks/manifest';

export interface NativeColoringPack {
  id: string;
  rootPath: string;
}

interface ColoringPacksPlugin {
  status(options: { version: string; bookIds: string[] }): Promise<{
    installed: NativeColoringPack[];
  }>;
  install(options: {
    version: string;
    appVersion: string;
    baseUrl: string;
    book: ResolvedColoringPackBookManifest;
    allowMetered: boolean;
  }): Promise<NativeColoringPack>;
  cancel(): Promise<void>;
  remove(options: { version: string }): Promise<void>;
}

export const ColoringPacks = registerPlugin<ColoringPacksPlugin>('ColoringPacks');

export function nativeColoringPackRootUrl(rootPath: string): string {
  return Capacitor.convertFileSrc(rootPath);
}
