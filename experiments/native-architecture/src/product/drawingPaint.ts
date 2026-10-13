import { useEffect } from 'react';

// The drawing screen's first paint with the child's settings. The web export holds back what that
// paint does not use (productOwnersLoader.web.ts, offlineLibrary/runtime.web.ts) until it has
// happened, so their fetches never compete with it.
function createDrawingPaint() {
  let mark = () => {};
  const painted = new Promise<void>((resolve) => {
    mark = resolve;
  });
  return { painted: () => painted, mark: () => mark() };
}

export const drawingPaint = createDrawingPaint();

export function useDrawingPainted(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    // A passive effect can run before the browser paints its commit; a frame and a task later, it
    // has.
    const frame = requestAnimationFrame(() => setTimeout(drawingPaint.mark));
    return () => cancelAnimationFrame(frame);
  }, [ready]);
}
