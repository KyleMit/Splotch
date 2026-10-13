import { act, createElement } from 'react';

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
