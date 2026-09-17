import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ResolvedColoringPackBookManifest } from '$lib/coloringPacks/manifest';
import type { ColoringPackResolution } from '$lib/coloringPacks/resolution';

export interface NativeColoringPack {
  id: string;
  rootPath: string;
}

// The native stores write `marker` into a book's install marker and trust that
// marker only while it still equals the current manifest's value.
export interface NativeColoringPackBook extends ResolvedColoringPackBookManifest {
  marker: string;
}

interface ColoringPacksPlugin {
  status(options: {
    resolution: ColoringPackResolution;
    books: NativeColoringPackBook[];
  }): Promise<{
    installed: NativeColoringPack[];
  }>;
  install(options: {
    resolution: ColoringPackResolution;
    appVersion: string;
    baseUrl: string;
    book: NativeColoringPackBook;
    allowMetered: boolean;
  }): Promise<NativeColoringPack>;
  cancel(): Promise<void>;
  remove(): Promise<void>;
}

export const ColoringPacks = registerPlugin<ColoringPacksPlugin>('ColoringPacks');

export function nativeColoringPackRootUrl(rootPath: string): string {
  return Capacitor.convertFileSrc(rootPath);
}
