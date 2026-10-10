import { Dimensions, Platform } from 'react-native';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';
import { createInkObservationController } from './inkObservation';
import { createPngAlphaDecoder } from './pngAlpha';
import { assertPngGrid } from './pngLimits';

const decoder = createPngAlphaDecoder();

export function createInkObservation() {
  return createInkObservationController(
    () => {
      const screen = { ...Dimensions.get('screen') };
      if (
        ![screen.width, screen.height, screen.scale, screen.fontScale].every(
          (value) => Number.isFinite(value) && value > 0
        )
      )
        throw new Error('Picture observation has invalid screen metrics.');
      if (Platform.OS !== 'android' && Platform.OS !== 'ios')
        throw new Error('Picture observation is unavailable on this platform.');
      const scale = Platform.OS === 'ios' ? screen.scale : 1;
      const grid = { width: PAPER_WIDTH * scale, height: PAPER_HEIGHT * scale };
      assertPngGrid(grid);
      let changed = false;
      const subscription = Dimensions.addEventListener('change', () => {
        changed = true;
      });
      return {
        grid,
        current() {
          const current = Dimensions.get('screen');
          return (
            !changed &&
            current.scale === screen.scale &&
            current.width === screen.width &&
            current.height === screen.height &&
            current.fontScale === screen.fontScale
          );
        },
        dispose: () => subscription.remove(),
      };
    },
    (base64, grid, isCurrent) => {
      if (!grid) throw new Error('Picture observation has no sampling grid.');
      return decoder.decode(base64, grid, isCurrent);
    }
  );
}
