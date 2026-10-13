// The polaroid's on-screen size, from the paper's aspect and the viewport alone. It imports
// nothing, so the native app sizes its own flight from the same rule
// (experiments/native-architecture/src/rsdDrawing/polaroidFlight.ts).
const POLAROID_MAX_WIDTH_PX = 480;
const POLAROID_PREFERRED_MIN_WIDTH_PX = 260;
const POLAROID_VIEWPORT_WIDTH_FRACTION = 0.54;
const POLAROID_VIEWPORT_MAX_WIDTH_FRACTION = 0.8;
const POLAROID_MAX_HEIGHT_FRACTION = 0.7;

type Size = Readonly<{ width: number; height: number }>;

export function polaroidCssSize(paper: Size, viewport: Size): Size | null {
  if (paper.width <= 0 || paper.height <= 0) return null;
  const aspectRatio = paper.width / paper.height;
  const preferredWidth = Math.max(
    POLAROID_PREFERRED_MIN_WIDTH_PX,
    Math.min(POLAROID_MAX_WIDTH_PX, viewport.width * POLAROID_VIEWPORT_WIDTH_FRACTION)
  );
  const width = Math.min(
    preferredWidth,
    viewport.width * POLAROID_VIEWPORT_MAX_WIDTH_FRACTION,
    viewport.height * POLAROID_MAX_HEIGHT_FRACTION * aspectRatio
  );
  return { width, height: width / aspectRatio };
}
