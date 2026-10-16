import { Platform } from 'react-native';
import { watchCaptureScreen } from './captureScreen';
import { createInkObservationController } from './inkObservation';
import { createPngAlphaDecoder } from './pngAlpha';
import { assertPngGrid } from './pngLimits';

const decoder = createPngAlphaDecoder();

export function createInkObservation() {
  return createInkObservationController(
    (paper) => {
      if (Platform.OS !== 'android' && Platform.OS !== 'ios')
        throw new Error('Picture observation is unavailable on this platform.');
      const capture = watchCaptureScreen();
      try {
        const scale = Platform.OS === 'ios' ? capture.screen.scale : 1;
        const grid = { width: paper.width * scale, height: paper.height * scale };
        assertPngGrid(grid);
        return { grid, current: capture.current, dispose: capture.dispose };
      } catch (error) {
        capture.dispose();
        throw error;
      }
    },
    (base64, grid, isCurrent) => {
      if (!grid) throw new Error('Picture observation has no sampling grid.');
      return decoder.decode(base64, grid, isCurrent);
    }
  );
}
