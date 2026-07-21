// Pure geometry for presenting the drawing's "paper" inside a viewport that has
// rotated since the paper was adopted (ADR-0050). While ink is on the canvas the
// engine locks the paper — the coordinate space every recorded op, the paper
// raster and its snapshots (ADR-0066), and the magic sheet live in — and a
// device rotation is handled by *presenting* that space through the view
// computed here instead of remapping any content. Production always presents
// UPRIGHT (rotation 0: the picture rotates with the device and contain-fits,
// centered); the quarter-turn cases are kept because the math is one unit and
// they document the rejected counter-rotate alternative (see ADR-0050).
// engine.ts owns all state; everything here is a pure function so the mapping
// math is unit-testable.

export type ViewRotation = 0 | 90 | 180 | 270;

// Maps paper coordinates to visible-canvas coordinates:
//   view(p) = translate(tx, ty) ∘ rotate(rotate, clockwise, y-down) ∘ scale(scale)
export interface PaperView {
  scale: number;
  rotate: ViewRotation;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

export const IDENTITY_PAPER_VIEW: PaperView = Object.freeze({
  scale: 1,
  rotate: 0 as ViewRotation,
  tx: 0,
  ty: 0,
});

export function isIdentityView(view: PaperView): boolean {
  return view.scale === 1 && view.rotate === 0 && view.tx === 0 && view.ty === 0;
}

// The normalized angle between the screen orientation at paper adoption and
// now. The engine uses it as the rotation DETECTOR (delta ≠ 0 means the device
// actually rotated, as opposed to a plain viewport resize); it is also the
// counter-rotation a glued-to-the-glass presentation would need, were that
// alternative ever revisited (ADR-0050).
export function rotationDelta(paperAngle: number, currentAngle: number): ViewRotation {
  return ((((paperAngle - currentAngle) % 360) + 360) % 360) as ViewRotation;
}

// Contain-fit the rotated paper into the viewport and center it. scale stays
// uniform (never stretches), so relative stroke weights inside the drawing are
// preserved — the page just reads as slightly further away when letterboxed.
export function computePaperView(paper: Size, viewport: Size, rotate: ViewRotation): PaperView {
  const rotatedW = rotate % 180 === 0 ? paper.width : paper.height;
  const rotatedH = rotate % 180 === 0 ? paper.height : paper.width;
  const scale = Math.min(viewport.width / rotatedW, viewport.height / rotatedH);
  const marginX = (viewport.width - rotatedW * scale) / 2;
  const marginY = (viewport.height - rotatedH * scale) / 2;
  // The translation puts the rotated paper's bounding box at (marginX, marginY):
  // rotation is about the paper origin, so each quarter-turn shifts which mapped
  // corner is the box's top-left.
  switch (rotate) {
    case 0:
      return { scale, rotate, tx: marginX, ty: marginY };
    case 90:
      return { scale, rotate, tx: marginX + rotatedW * scale, ty: marginY };
    case 180:
      return { scale, rotate, tx: marginX + rotatedW * scale, ty: marginY + rotatedH * scale };
    case 270:
      return { scale, rotate, tx: marginX, ty: marginY + rotatedH * scale };
  }
}

// The view as a 2D affine matrix in the argument order shared by
// ctx.setTransform(a, b, c, d, e, f) and CSS matrix(a, b, c, d, e, f):
//   x' = a·x + c·y + e,  y' = b·x + d·y + f
export function viewMatrix(view: PaperView): [number, number, number, number, number, number] {
  const s = view.scale;
  switch (view.rotate) {
    case 0:
      return [s, 0, 0, s, view.tx, view.ty];
    case 90: // (x, y) → (−y, x)
      return [0, s, -s, 0, view.tx, view.ty];
    case 180: // (x, y) → (−x, −y)
      return [-s, 0, 0, -s, view.tx, view.ty];
    case 270: // (x, y) → (y, −x)
      return [0, -s, s, 0, view.tx, view.ty];
  }
}

export function paperToView(view: PaperView, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = viewMatrix(view);
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

// Inverse mapping — visible-canvas (pointer) coordinates back to paper
// coordinates, so live input lands in the space ops are recorded in.
export function viewToPaper(view: PaperView, x: number, y: number): { x: number; y: number } {
  const u = (x - view.tx) / view.scale;
  const v = (y - view.ty) / view.scale;
  switch (view.rotate) {
    case 0:
      return { x: u, y: v };
    case 90:
      return { x: v, y: -u };
    case 180:
      return { x: -u, y: -v };
    case 270:
      return { x: -v, y: u };
  }
}
