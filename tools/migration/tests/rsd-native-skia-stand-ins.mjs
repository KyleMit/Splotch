import { vi } from 'vitest';

// Native Skia cannot load in Node; native-glass-pane-raster tests the compositor's CanvasKit pixels.
vi.mock('../../../experiments/native-architecture/src/rsdDrawing/glassPaneImage.ts', () => ({
  glassPaneImage: vi.fn(async () => null),
}));
// The departing page's ink is a Skia picture view; its stand-in is a View carrying the snapshot.
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/DepartingInkView.tsx',
  async () => {
    const { createElement } = await import('react');
    const { View } = await import('react-native');
    return {
      DepartingInkView: (props) => createElement(View, { testID: 'rsd-clear-sheet-ink', ...props }),
    };
  }
);
