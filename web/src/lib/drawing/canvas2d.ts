// A browser returns null here once its canvas memory budget is spent (iOS
// WebKit does this under pressure); failing with a named error beats the
// TypeError the first property write on a null context would throw.
export function require2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  return context;
}
