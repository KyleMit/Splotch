import { act, createElement } from 'react';
import { vi } from 'vitest';
import { drawingPaper, paperProjection } from '../../src/drawing/paperSpace.ts';

vi.mock('../../src/platform/animated.ts', async () => {
  const { animatedPort, easingPort } =
    await import('../migration/tests/rsd-native-animated-host.mjs');
  const { View } = await import('react-native');
  return { Animated: animatedPort(View, View), Easing: easingPort };
});

export function createPictureSurfaceFixture({
  DrawingAppearanceProvider,
  DrawingSurface,
  createSpy,
  readMount,
}) {
  return async function surface(
    drawing,
    preference = 'system',
    projection = paperProjection(drawingPaper(drawing))
  ) {
    const { root, ref, error, busy } = readMount();
    await act(async () =>
      root.render(
        createElement(
          DrawingAppearanceProvider,
          { preference },
          createElement(DrawingSurface, {
            ref,
            drawing,
            projection,
            currentDrawing: () => drawing,
            color: 'Blue',
            brush: 'pen',
            strokeWidth: 'medium',
            eraserWidth: 'medium',
            disabled: false,
            onCohort: createSpy(),
            onDrawingChange: createSpy(),
            onPreparingChange: busy,
            onRendererFault: error,
            onError: error,
          })
        )
      )
    );
  };
}
