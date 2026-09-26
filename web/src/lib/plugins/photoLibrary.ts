import { registerPlugin } from '@capacitor/core';
import type { AndroidGalleryImageType } from '$lib/drawing/androidGallery';

export interface PhotoLibraryPlugin {
  // Android-only (PhotoLibraryPlugin.java). The image crosses the bridge as base64 slices appended
  // to an upload (androidGallery.ts says why), then saveImage writes the upload into shared
  // Pictures/Splotch and discards it, whether the write succeeds or not. discardImage drops an
  // upload whose appends failed; an upload nobody finishes expires on the next beginImage.
  beginImage(): Promise<{ uploadId: string }>;
  appendImageData(options: { uploadId: string; data: string }): Promise<void>;
  discardImage(options: { uploadId: string }): Promise<void>;
  saveImage(options: {
    uploadId: string;
    mimeType: AndroidGalleryImageType;
    displayName: string;
  }): Promise<void>;
}

// No web fallback: only the Android native branch of saveImageBlob reaches this plugin.
export const PhotoLibrary = registerPlugin<PhotoLibraryPlugin>('PhotoLibrary');
