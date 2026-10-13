import type { PhotoLibrary } from '../export/photoLibrary';

// A browser has no photo library to write to; saves keep the in-app copy and Export PNG
// stays the way to download one.
export const photoLibrary: PhotoLibrary | null = null;
