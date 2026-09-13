import { extensionForImageType, timestamp } from '$lib/saveNaming';

export const ANDROID_GALLERY_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AndroidGalleryImageType = (typeof ANDROID_GALLERY_IMAGE_TYPES)[number];

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
  await PhotoLibrary.saveImage({
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mimeType,
    displayName: `${baseName}-${timestamp()}.${extensionForImageType(mimeType)}`,
  });
}
