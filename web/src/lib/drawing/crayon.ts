// The crayon's tooth is deliberately the same low-alpha paper grain that sits
// below the transparent drawing canvas. Painting it source-atop the wax gives
// the ink a paper-space texture without ever letting a mark escape its stroke.

let paperImage: HTMLImageElement | null = null;
let paperLoad: Promise<HTMLImageElement | null> | null = null;
let repaint: (() => void) | null = null;
let patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function loadPaperImage(): Promise<HTMLImageElement | null> {
  if (paperImage) return Promise.resolve(paperImage);
  if (paperLoad) return paperLoad;
  paperLoad = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      paperImage = image;
      patterns = new WeakMap();
      resolve(image);
      repaint?.();
    };
    image.onerror = () => resolve(null);
    image.src = '/icons/handmade-paper.webp';
  });
  return paperLoad;
}

export function initCrayonTooth(onTextureReady: () => void) {
  repaint = onTextureReady;
  void loadPaperImage();
}

export function warmCrayonTooth() {
  void loadPaperImage();
}

export function toothPatternFor(target: CanvasRenderingContext2D): CanvasPattern | null {
  if (!paperImage) return null;
  const cached = patterns.get(target);
  if (cached) return cached;
  const pattern = target.createPattern(paperImage, 'repeat');
  if (!pattern) return null;
  patterns.set(target, pattern);
  return pattern;
}
