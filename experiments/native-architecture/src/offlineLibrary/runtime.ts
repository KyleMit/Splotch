import { createLibraryPlatform } from '../platform/offlineLibrary';
import { createOfflineLibrary } from './controller';

// The candidate paper uses canonical fills; choosing a smaller tier needs its own presentation proof.
export const offlineLibrary = createOfflineLibrary(createLibraryPlatform(), 'full');
