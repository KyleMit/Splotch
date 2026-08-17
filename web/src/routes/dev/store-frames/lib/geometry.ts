// The shared frame layout geometry: where the app capture sits inside each
// store slot, the copy zone, and the capture viewport that produces a
// pixel-for-pixel app screenshot for that frame. Authored at the Google Play
// sizes (landscape 1920×1080, portrait 1080×1920) and scaled linearly by width
// for the App Store sizes, so one spec produces every store slot. Landscape
// (the 2026-08 refresh) puts the copy in a left column with the frame bleeding
// off the right edge. Portrait (the 2026-08 portrait v2 handoff) centers the
// copy in a zone above a fully visible frame; the handoff specified output
// pixels at the App Store 6.9" slot (1290×2796), stored here divided by that
// slot's k = 1290/1080.
//
// Imported by tools/marketing-assets/gen-store-assets.mjs under
// `node --experimental-strip-types` — relative imports only.

import type { StoreOrientation, StoreTarget } from './targets.ts';

// Landscape spec (1920×1080 base): copy column x=96 w=470, frame x=600 y=57
// 1360×966 bleeding off the right edge, app UI at ~1.5× native scale.
const L_BASE_W = 1920;
export const L_BASE_H = 1080;
const L_COPY_X = 96;
const L_COPY_W = 470;
const L_FRAME_X = 600;
const L_FRAME_W = 1360;
const L_FRAME_Y = 57;
const L_APP_SCALE = 1.5;

// Portrait reflow (1080×1920 base, per the portrait v2 handoff): copy centered
// both axes in a zone spanning the full width above the frame, frame fully
// visible below (the portrait app keeps its toolbar at the bottom edge, so
// the frame must not bleed).
export const P_BASE_W = 1080;
const P_COPY_SIDE = 75;
const P_COPY_H = 536;
const P_FRAME_MARGIN = 71;
const P_FRAME_Y = 536;
const P_BOTTOM_MARGIN = 63;
// Fixed capture width, NOT a fixed app scale: it must stay under the app's
// 600px tablet-class floor (TABLET_MIN_SIDE_PX) or the portrait app defaults
// to forced-landscape paper. 576 keeps every portrait target phone-class at
// ~1.6× native scale.
const P_CAPTURE_CSS_W = 576;

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export type FrameGeometry =
  | {
      k: number;
      orientation: 'landscape';
      frame: FrameRect;
      copy: { x: number; width: number };
      capture: CaptureViewport;
    }
  | {
      k: number;
      orientation: 'portrait';
      frame: FrameRect;
      copy: { x: number; top: number; width: number; height: number };
      capture: CaptureViewport;
    };

type TargetSize = Pick<StoreTarget, 'width' | 'height' | 'orientation'> & {
  orientation: StoreOrientation;
};

export function frameGeometry(target: TargetSize): FrameGeometry {
  const { width: W, height: H, orientation } = target;
  if (orientation === 'landscape') {
    const k = W / L_BASE_W;
    const frame = {
      x: Math.round(L_FRAME_X * k),
      y: Math.round(L_FRAME_Y * k),
      width: Math.round(L_FRAME_W * k),
      height: H - 2 * Math.round(L_FRAME_Y * k),
    };
    const cssW = Math.round(frame.width / (L_APP_SCALE * k));
    const deviceScaleFactor = frame.width / cssW;
    const cssH = Math.round(frame.height / deviceScaleFactor);
    frame.height = Math.round(cssH * deviceScaleFactor);
    return {
      k,
      orientation,
      frame,
      copy: { x: Math.round(L_COPY_X * k), width: Math.round(L_COPY_W * k) },
      capture: { width: cssW, height: cssH, deviceScaleFactor },
    };
  }
  const k = W / P_BASE_W;
  const margin = Math.round(P_FRAME_MARGIN * k);
  const frame = {
    x: margin,
    y: Math.round(P_FRAME_Y * k),
    width: W - 2 * margin,
    height: H - Math.round(P_FRAME_Y * k) - Math.round(P_BOTTOM_MARGIN * k),
  };
  const deviceScaleFactor = frame.width / P_CAPTURE_CSS_W;
  const cssH = Math.round(frame.height / deviceScaleFactor);
  frame.height = Math.round(cssH * deviceScaleFactor);
  const copySide = Math.round(P_COPY_SIDE * k);
  return {
    k,
    orientation,
    frame,
    copy: { x: copySide, top: 0, width: W - 2 * copySide, height: Math.round(P_COPY_H * k) },
    capture: { width: P_CAPTURE_CSS_W, height: cssH, deviceScaleFactor },
  };
}
