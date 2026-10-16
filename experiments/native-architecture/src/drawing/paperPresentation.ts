import {
  containFit,
  paperPresentationFor,
  SYSTEM_BAR_OCCLUSION_MAX_CSS_PX,
  type Size,
} from '../../../../web/src/lib/drawing/paperView';
import type { AdoptedPaper, PaperReference } from './paperSpace';
import type { ToolbarStyle } from '../settings/toolbarStyle';

// Where the paper sits inside its slot, in the slot's CSS pixels. It may reach past the slot,
// which crops it.
export type PresentedFrame = Readonly<{ left: number; top: number; width: number; height: number }>;
type Point = Readonly<{ x: number; y: number }>;

// Shipping's PaperLayoutSnapshot (paperLayout.ts): an inked paper held at a screen position and
// scale, kept while the window stays within system-bar reach of the size it was taken at.
type Retained = Readonly<{ paper: AdoptedPaper; screen: Point; size: Size; window: Size }>;

export type PaperPresentationInputs = Readonly<{
  paper: PaperReference;
  // No visible ink: shipping's canvasEmpty, which frees the paper to adopt the slot.
  empty: boolean;
  slot: Size;
  // The slot's top-left corner in the layout's coordinates, which a Button style switch moves.
  origin: Point;
  window: Size;
  toolbarStyle: ToolbarStyle;
}>;

export type PaperPresentationState = Readonly<{
  inputs: PaperPresentationInputs | null;
  frame: PresentedFrame | null;
  extent: Size | null;
  retained: Retained | null;
}>;

export const INITIAL_PAPER_PRESENTATION: PaperPresentationState = {
  inputs: null,
  frame: null,
  extent: null,
  retained: null,
};

const landscape = (size: Size) => size.width > size.height;

// restorePaperLayout's rule: a rotation, or a window resize larger than system chrome, releases
// the held presentation and hands the paper back to the resize policy.
function stillApplies(retained: Retained, window: Size) {
  return (
    landscape(retained.window) === landscape(window) &&
    Math.abs(retained.window.width - window.width) <= SYSTEM_BAR_OCCLUSION_MAX_CSS_PX &&
    Math.abs(retained.window.height - window.height) <= SYSTEM_BAR_OCCLUSION_MAX_CSS_PX
  );
}

function fitted(paper: Size, slot: Size): PresentedFrame {
  const { scale, offsetX, offsetY } = containFit(paper, slot);
  return { left: offsetX, top: offsetY, width: paper.width * scale, height: paper.height * scale };
}

function policyFrame(size: Size, slot: Size, layoutOnly: boolean) {
  const presentation = paperPresentationFor({
    canvasEmpty: false,
    paper: size,
    paperAngle: 0,
    screenAngle: 0,
    viewport: slot,
    layoutOnly,
  });
  const extent = presentation === 'adopt' ? slot : size;
  const frame = presentation === 'fit' ? fitted(size, slot) : { left: 0, top: 0, ...extent };
  return { extent, frame };
}

function retainedFrame(retained: Retained, origin: Point): PresentedFrame {
  return {
    left: retained.screen.x - origin.x,
    top: retained.screen.y - origin.y,
    width: retained.size.width,
    height: retained.size.height,
  };
}

// A Button style switch with ink keeps the paper where it is on screen (shipping's
// updateDrawingLayout): the held position is the current frame in layout coordinates.
function retainCurrent(state: PaperPresentationState, paper: AdoptedPaper): Retained | null {
  const { inputs, frame } = state;
  if (!inputs || !frame || inputs.paper !== paper) return null;
  return {
    paper,
    screen: { x: inputs.origin.x + frame.left, y: inputs.origin.y + frame.top },
    size: { width: frame.width, height: frame.height },
    window: inputs.window,
  };
}

export function presentPaper(
  state: PaperPresentationState,
  inputs: PaperPresentationInputs
): PaperPresentationState {
  const { paper, slot } = inputs;
  if (paper.kind === 'unadopted' || (inputs.empty && paper.kind === 'adopted'))
    return { inputs, retained: null, extent: slot, frame: { left: 0, top: 0, ...slot } };
  if (paper.kind === 'legacy') return { inputs, retained: null, extent: null, frame: null };
  const previous = state.inputs;
  const extent =
    previous?.paper === paper && state.extent
      ? state.extent
      : { width: paper.cssWidth, height: paper.cssHeight };
  const styleSwitched =
    previous !== null && previous.toolbarStyle !== inputs.toolbarStyle && previous.paper === paper;
  let retained = styleSwitched ? retainCurrent(state, paper) : state.retained;
  if (retained && (retained.paper !== paper || !stillApplies(retained, inputs.window)))
    retained = null;
  if (retained) return { inputs, retained, extent, frame: retainedFrame(retained, inputs.origin) };
  const layoutOnly =
    previous !== null &&
    previous.window.width === inputs.window.width &&
    previous.window.height === inputs.window.height;
  return { inputs, retained: null, ...policyFrame(extent, slot, layoutOnly) };
}
