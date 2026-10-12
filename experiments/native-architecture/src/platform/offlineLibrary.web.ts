import { LibraryFault, type LibraryPlatform } from '../offlineLibrary/contract';

export function createLibraryPlatform(): LibraryPlatform {
  const unavailable = () => {
    throw new LibraryFault(
      'unavailable',
      'Downloadable coloring books are available in the native app candidate.'
    );
  };
  return {
    environment: unavailable,
    list: unavailable,
    read: unavailable,
    write: unavailable,
    remove: unavailable,
    move: unavailable,
    uri: unavailable,
    verify: unavailable,
    download: unavailable,
    dispose() {},
  };
}
