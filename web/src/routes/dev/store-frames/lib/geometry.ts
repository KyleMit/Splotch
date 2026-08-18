// The shared frame layout geometry: where the app capture sits inside each
// store slot, the copy zone, and the capture viewport that produces a
// pixel-for-pixel app screenshot for that frame. Authored at the Google Play
// sizes (landscape 1920×1080, portrait 1080×1920) and scaled linearly by width
// for the App Store sizes, so one spec produces every store slot. Landscape
// (the 2026-08 refresh, refit by the 2026-08-17 handoff) puts the copy in a left
// column with the frame fully inside the slot. Portrait (the 2026-08 portrait v2
// handoff) centers the copy in a zone above a fully visible frame; that handoff
// specified output pixels at the App Store 6.9" slot (1290×2796), stored here
// divided by that slot's k = 1290/1080.
//
// Imported by tools/marketing-assets/gen-store-assets.mjs under
// `node --experimental-strip-types` — relative imports only.

import type { StoreOrientation, StoreTarget } from './targets.ts';

// Landscape spec (1920×1080 base): copy column x=96 w=470, frame x=600 y=92
// 1263×897 sitting fully inside the slot — the earlier 1360-wide frame bled 40px
// off the right edge and sliced the trash button in half.
const L_BASE_W = 1920;
export const L_BASE_H = 1080;
const L_COPY_X = 96;
const L_COPY_W = 470;
const L_FRAME_X = 600;
const L_FRAME_W = 1263;
const L_FRAME_Y = 92;
const L_FRAME_H = 897;
// What the authored rect leaves below the frame at the 16:9 base. Taller slots
// (ipad13's 4:3) keep filling the height between the two scaled margins rather
// than banding out at the base aspect, so the frame stays the page's subject.
const L_FRAME_BOTTOM = L_BASE_H - L_FRAME_Y - L_FRAME_H;
// Not 1.5: at that scale the fitted frame captures 842×598 CSS px, and the
// 598 drops under the app's tablet-class floor (TABLET_MIN_SIDE_PX), re-laying
// the action buttons out as a phone. 1.3925 holds the capture viewport at the
// 907×644 the wider frame used, so only the rendered size changes.
const L_APP_SCALE = 1.3925;

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
    const y = Math.round(L_FRAME_Y * k);
    const frame = {
      x: Math.round(L_FRAME_X * k),
      y,
      width: Math.round(L_FRAME_W * k),
      height: H - y - Math.round(L_FRAME_BOTTOM * k),
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
