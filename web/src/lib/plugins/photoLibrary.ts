import { registerPlugin } from '@capacitor/core';
import type { AndroidGalleryImageType } from '$lib/drawing/androidGallery';

export interface PhotoLibraryPlugin {
  // Android-only (PhotoLibraryPlugin.java): writes the image into shared Pictures/Splotch.
  saveImage(options: {
    data: string;
    mimeType: AndroidGalleryImageType;
    displayName: string;
  }): Promise<void>;
}

// No web fallback: only the Android native branch of saveImageBlob reaches this plugin.
export const PhotoLibrary = registerPlugin<PhotoLibraryPlugin>('PhotoLibrary');
