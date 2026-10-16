import { act, createElement } from 'react';
import { vi } from 'vitest';

vi.mock('../../experiments/native-architecture/src/platform/animated.ts', async () => {
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
  return async function surface(drawing, preference = 'system') {
    const { root, ref, error, busy } = readMount();
    await act(async () =>
      root.render(
        createElement(
          DrawingAppearanceProvider,
          { preference },
          createElement(DrawingSurface, {
            ref,
            drawing,
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
