// Pure geometry for presenting the drawing's "paper" inside a viewport that has
// rotated since the paper was adopted (ADR-0050). While ink is on the canvas the
// engine locks the paper — the coordinate space every recorded op, live tile,
// history base, undo patch, and magic sheet lives in — and a
// device rotation is handled by *presenting* that space through the view
// computed here instead of remapping any content. Production always presents
// UPRIGHT (rotation 0: the picture rotates with the device and contain-fits,
// centered); the quarter-turn cases are kept because the math is one unit and
// they document the rejected counter-rotate alternative (see ADR-0050).
// engine.ts owns all state; everything here is a pure function so the mapping
// math is unit-testable.

import type { Orientation } from '$lib/platform';
import type { Point } from './strokeMath';

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

// Absorbs a viewport that reads a hair larger than the paper it was adopted
// from: native rotation can settle its insets a few pixels late, and the
// container's measured rect carries subpixel rounding. Adopting either as a
// genuine grow invalidates every tile.
const PAPER_COVERAGE_TOLERANCE_CSS_PX = 8;

// System chrome is absolute-sized, not a proportion of the screen: Material's
// navigation bar is 48dp and a status bar with a display cutout runs to about
// the same, so the pair tops out near this even stacked. A viewport that lost
// MORE than this on an axis is a deliberate resize — a dragged window edge,
// split-screen, a keyboard — which should re-fit the drawing rather than hide
// part of it behind nothing.
const SYSTEM_BAR_OCCLUSION_MAX_CSS_PX = 96;

// Whether the viewport differs from the paper by no more than system chrome and
// inset drift can account for — the band inside which the paper is worth
// keeping at all, rather than re-adopting and invalidating every tile.
function viewportDeltaIsChromeSized(paper: Size, viewport: Size): boolean {
  const lostWidth = paper.width - viewport.width;
  const lostHeight = paper.height - viewport.height;
  return (
    lostWidth >= -PAPER_COVERAGE_TOLERANCE_CSS_PX &&
    lostHeight >= -PAPER_COVERAGE_TOLERANCE_CSS_PX &&
    lostWidth <= SYSTEM_BAR_OCCLUSION_MAX_CSS_PX &&
    lostHeight <= SYSTEM_BAR_OCCLUSION_MAX_CSS_PX
  );
}

// Whether every visible pixel is paper. This is what `window` requires: an
// identity view maps the paper one-to-one and cannot stretch to cover anything
// beyond it, so a viewport even slightly larger has to be fitted instead.
function paperCoversViewport(paper: Size, viewport: Size): boolean {
  return viewport.width <= paper.width && viewport.height <= paper.height;
}

// How a resize reconciles the live viewport with the paper (ADR-0050, ADR-0099):
//
// * `adopt` — the paper becomes the viewport, the pre-lock semantics. An empty
//   canvas has nothing to preserve, and a viewport that grew past the paper has
//   visible area the old paper cannot cover.
// * `window` — the paper is kept and presented at IDENTITY; the viewport is a
//   window onto it. A viewport that lost only a bar's worth at an unchanged
//   angle is a transient occlusion — Android's immersive nav bar swiped back, a
//   mobile URL bar — so nothing may move: the covered band is cropped and comes
//   back untouched when the bars go away. A larger shrink is a real resize and
//   adopts, so a dragged-in window edge still re-fits the page.
// * `fit` — the paper is kept and presented upright, contain-fit and centered,
//   so a rotated drawing stays fully visible (ADR-0050). Also the landing spot
//   for a tolerated grow, which `window` cannot cover.
//
// Only `adopt` resizes the paper, and resizing the paper is what pulls the
// coloring art and the magic fill (both contain-fit WITHIN the paper) out of
// alignment with ink, which is anchored at the paper origin.
export type PaperPresentation = 'adopt' | 'window' | 'fit';

// Paper and viewport are both CSS px — the space the paper's dimensions are
// adopted in — so the caller compares like with like.
export function paperPresentationFor(state: {
  canvasEmpty: boolean;
  paper: Size;
  paperAngle: number;
  screenAngle: number;
  viewport: Size;
}): PaperPresentation {
  const { canvasEmpty, paper, paperAngle, screenAngle, viewport } = state;
  if (canvasEmpty) return 'adopt';
  const rotated =
    rotationDelta(paperAngle, screenAngle) !== 0 ||
    paper.width > paper.height !== viewport.width > viewport.height;
  if (rotated) return 'fit';
  if (!viewportDeltaIsChromeSized(paper, viewport)) return 'adopt';
  // Inside the band the paper is kept either way; only a paper that actually
  // covers the viewport may take the identity `window`. A tolerated grow falls
  // through to `fit`, which scales the paper over the drift and re-arms the
  // engine's out-of-paper guard — an identity view there would leave those
  // pixels with no paper or tile behind them, unpresented yet still accepting
  // gestures that record invisible ops.
  return paperCoversViewport(paper, viewport) ? 'window' : 'fit';
}

export const IDENTITY_PAPER_VIEW: Readonly<PaperView> = Object.freeze<PaperView>({
  scale: 1,
  rotate: 0,
  tx: 0,
  ty: 0,
});

export function containFit(
  content: Size,
  box: Size
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(box.width / content.width, box.height / content.height);
  return {
    scale,
    offsetX: (box.width - content.width * scale) / 2,
    offsetY: (box.height - content.height * scale) / 2,
  };
}

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
  const {
    scale,
    offsetX: marginX,
    offsetY: marginY,
  } = containFit({ width: rotatedW, height: rotatedH }, viewport);
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

// The view a presentation is shown through. Production always presents UPRIGHT
// (rotate 0 — see computePaperView); `window` and `adopt` need no mapping at
// all, since the paper's origin already sits at the viewport's.
export function viewForPresentation(
  presentation: PaperPresentation,
  paper: Size,
  viewport: Size
): PaperView {
  return presentation === 'fit' ? computePaperView(paper, viewport, 0) : IDENTITY_PAPER_VIEW;
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

export function paperToView(view: PaperView, x: number, y: number): Point {
  const [a, b, c, d, e, f] = viewMatrix(view);
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

// Inverse mapping — visible-canvas (pointer) coordinates back to paper
// coordinates, so live input lands in the space ops are recorded in.
export function viewToPaper(view: PaperView, x: number, y: number): Point {
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

// The paper view published to components (CSS px), so the coloring-page overlay
// can be positioned with the same transform the canvas paints through, and the
// picker can keep offering the locked paper's tall/wide art variant. Lives here
// with the presentation math rather than in engine.ts, whose state it is
// derived from; the engine re-exports both so components keep one import.
export interface EngineViewState {
  active: boolean;
  scale: number;
  rotate: PaperView['rotate'];
  tx: number;
  ty: number;
  paperCssWidth: number;
  paperCssHeight: number;
  paperOrientation: Orientation;
}

// The pre-adoption SSR-shell value of EngineViewState, before getViewState() has
// any paper/render-scale state to derive from.
export const INITIAL_ENGINE_VIEW_STATE: EngineViewState = Object.freeze({
  active: false,
  scale: 1,
  rotate: 0,
  tx: 0,
  ty: 0,
  paperCssWidth: 0,
  paperCssHeight: 0,
  paperOrientation: 'portrait',
});
