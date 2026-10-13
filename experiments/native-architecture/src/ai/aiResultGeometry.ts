import {
  DIAL_MAX_SIZE_PX,
  DIAL_STAGE_FRACTION,
} from '../../../../web/src/lib/components/aiDialGeometry';

// AiImageResult.svelte's card budget and app.css's report strip, which React Native lays out from
// numbers rather than calc(). native-ai-flow-geometry.test.mjs reads each back from shipping.
export const AI_RESULT_METRICS = {
  // max(46px, var(--touch-target-min))
  loadingCaptionHeight: 48,
  keepDrawingHeight: 48,
  sizingAir: 1,
  // --space-4 padding on each side of the content
  contentPadding: 16,
  // --space-3 between the stage, its caption and its footer
  contentGap: 12,
  gutterMin: 10,
  gutterMax: 80,
  gutterRampFrom: 390,
  gutterRamp: 0.14,
  minWidth: 340,
  safetyWidth: 560,
  serverErrorWidth: 400,
  reportStripHeight: 26,
  reportStripGap: 16,
  reportStripTap: 48,
} as const;

// What the card is holding, which decides its width and the room its picture gets: a picture
// still being made with the Keep drawing pill under it, a picture (or its placeholder), a safety
// refusal, or the error card.
export type AiResultMode = 'waiting' | 'picture' | 'safety' | 'serverError';

type Size = { width: number; height: number };
type Insets = { top: number; right: number; bottom: number; left: number };

export type AiResultFrame = Readonly<{
  width: number;
  maxHeight: number;
  // The card sits on the middle of the band its bounds leave, not on the window's.
  shiftY: number;
  stage: Size;
  dialSize: number;
}>;

const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(value, max));

export function aiResultFrame({
  window,
  insets,
  aspect,
  mode,
  naturalWidth,
}: {
  window: Size;
  insets: Insets;
  aspect: number;
  mode: AiResultMode;
  // The decoded picture's own width, which the stage never draws past; null before it decodes.
  naturalWidth: number | null;
}): AiResultFrame {
  const m = AI_RESULT_METRICS;
  const vmin = Math.min(window.width, window.height);
  const gutter = clamp(
    m.gutterMin,
    m.gutterMin + (vmin - m.gutterRampFrom) * m.gutterRamp,
    m.gutterMax
  );
  const stripReserve =
    m.reportStripGap + (m.reportStripHeight + m.reportStripTap) / 2 + insets.bottom;
  const top = Math.max(insets.top, gutter);
  const bottom = Math.max(mode === 'safety' ? insets.bottom : stripReserve, gutter);
  const side = Math.max(insets.left, insets.right, gutter);
  const maxHeight = window.height - top - bottom;
  const loadingReserve = 2 * m.contentPadding + m.contentGap + m.loadingCaptionHeight + m.sizingAir;
  const footerReserve =
    mode === 'waiting' ? loadingReserve + m.contentGap + m.keepDrawingHeight : loadingReserve;
  const stageMaxHeight = maxHeight - footerReserve;
  const maxWidth = window.width - 2 * side;
  const inlinePadding = 2 * m.contentPadding;
  const stageMaxWidth = maxWidth - inlinePadding;
  const width =
    mode === 'safety'
      ? Math.min(maxWidth, m.safetyWidth)
      : mode === 'serverError'
        ? Math.min(maxWidth, m.serverErrorWidth)
        : clamp(Math.min(maxWidth, m.minWidth), stageMaxHeight * aspect + inlinePadding, maxWidth);
  const stageWidth = Math.max(
    0,
    Math.min(stageMaxWidth, stageMaxHeight * aspect, naturalWidth ?? Infinity)
  );
  return {
    width,
    maxHeight,
    shiftY: (top - bottom) / 2,
    stage: { width: stageWidth, height: stageWidth / aspect },
    dialSize: Math.min(stageWidth * DIAL_STAGE_FRACTION, DIAL_MAX_SIZE_PX),
  };
}
