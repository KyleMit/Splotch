import { currentColoringPackResolution } from '../../../../web/src/lib/coloringPacks/resolution';
import { createLibraryPlatform } from '../platform/offlineLibrary';
import { createOfflineLibrary } from './controller';

export function createLibrary() {
  return createOfflineLibrary(createLibraryPlatform(), currentColoringPackResolution());
}
