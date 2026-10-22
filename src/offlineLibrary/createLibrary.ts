import { Dimensions } from 'react-native';
import { coloringPackResolutionForScreen } from '../lib/coloringPacks/resolution';
import { createLibraryPlatform } from '../platform/offlineLibrary';
import { createOfflineLibrary } from './controller';

export function createLibrary() {
  const screen = Dimensions.get('screen');
  const resolution = coloringPackResolutionForScreen({
    widthCssPx: screen.width,
    heightCssPx: screen.height,
    devicePixelRatio: screen.scale,
  });
  const library = createOfflineLibrary(createLibraryPlatform(), resolution);
  library.engage();
  return library;
}
