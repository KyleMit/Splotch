import { extensionForImageType, timestamp } from '$lib/saveNaming';

export const ANDROID_GALLERY_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AndroidGalleryImageType = (typeof ANDROID_GALLERY_IMAGE_TYPES)[number];

// WebView hands every bridge message to Capacitor on the Android UI thread, the thread that also
// schedules the WebView's frames, so that thread is busy for as long as one message takes to land.
// A whole drawing in one message (2–3 million base64 characters) held it for 69–97 ms on the
// SM-G990U1 and froze a clear's sheet animation for 75–134 ms (issue 2340). A slice of this size
// measured 9–14 ms there, so the worst frame during a save is 25 ms. A multiple of 4 so that no
// slice splits a base64 quantum.
export const ANDROID_GALLERY_CHUNK_CHARS = 256 * 1024;

function androidGalleryImageType(blobType: string): AndroidGalleryImageType {
  const essence = blobType.split(';')[0].trim().toLowerCase();
  const supported = ANDROID_GALLERY_IMAGE_TYPES.find((type) => type === essence);
  if (!supported) throw new Error(`The photo library cannot store "${blobType}" images`);
  return supported;
}

// The app-specific media folder the community Media plugin writes to is deleted with the app,
// so Android saves go through the app's own PhotoLibrary plugin into shared Pictures/Splotch.
export async function saveToAndroidGallery(dataUrl: string, blobType: string, baseName: string) {
  const mimeType = androidGalleryImageType(blobType);
  const { PhotoLibrary } = await import('$lib/plugins/photoLibrary');
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const { uploadId } = await PhotoLibrary.beginImage();
  try {
    for (let start = 0; start < data.length; start += ANDROID_GALLERY_CHUNK_CHARS) {
      await PhotoLibrary.appendImageData({
        uploadId,
        data: data.slice(start, start + ANDROID_GALLERY_CHUNK_CHARS),
      });
    }
  } catch (error) {
    // The plugin holds the slices until saveImage or discardImage; the save's own error wins.
    await PhotoLibrary.discardImage({ uploadId }).catch(() => undefined);
    throw error;
  }
  await PhotoLibrary.saveImage({
    uploadId,
    mimeType,
    displayName: `${baseName}-${timestamp()}.${extensionForImageType(mimeType)}`,
  });
}
