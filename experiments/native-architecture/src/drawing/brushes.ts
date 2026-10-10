import { DEFAULT_STROKE_WIDTH, STROKE_WIDTH_PX } from './strokeWidth';

export const BRUSHES = {
  pencil: { label: 'Pencil', width: STROKE_WIDTH_PX.pencil[DEFAULT_STROKE_WIDTH] },
  marker: { label: 'Marker', width: STROKE_WIDTH_PX.marker[DEFAULT_STROKE_WIDTH] },
  crayon: { label: 'Crayon', width: STROKE_WIDTH_PX.crayon[DEFAULT_STROKE_WIDTH] },
  magic: { label: 'Magic Brush', width: STROKE_WIDTH_PX.magic[DEFAULT_STROKE_WIDTH] },
  eraser: { label: 'Eraser', width: STROKE_WIDTH_PX.eraser[DEFAULT_STROKE_WIDTH] },
} as const;

export const BRUSH_ORDER = ['pencil', 'marker', 'crayon', 'magic', 'eraser'] as const;
export type Brush = (typeof BRUSH_ORDER)[number];
export const MAGIC_RAINBOW_COUNT = 10;
export const INITIAL_RAINBOW = 0;
export const MAX_CRAYON_SEED = 0xffffffff;

type RainbowStop = Readonly<{ offset: number; color: string }>;
export type Rainbow = Readonly<{ angle: number; stops: readonly RainbowStop[] }>;

const RAINBOW_STOP_COUNT = 7;
const RAINBOW_HUE_SPAN_DEG = 320;
const RAINBOW_SATURATION_PERCENT = 84;
const RAINBOW_LIGHTNESS_PERCENT = 60;
const RAINBOW_ANGLE_STEP = Math.PI * 0.618;
const RAINBOW_HUE_STEP_DEG = 137;

export function rainbow(index: number): Rainbow {
  return {
    angle: index * RAINBOW_ANGLE_STEP,
    stops: Array.from({ length: RAINBOW_STOP_COUNT }, (_, position) => {
      const offset = position / (RAINBOW_STOP_COUNT - 1);
      const hue = (index * RAINBOW_HUE_STEP_DEG + offset * RAINBOW_HUE_SPAN_DEG) % 360;
      return {
        offset,
        color: `hsl(${hue}, ${RAINBOW_SATURATION_PERCENT}%, ${RAINBOW_LIGHTNESS_PERCENT}%)`,
      };
    }),
  };
}

export function rainbowLine(index: number, width: number, height: number) {
  const { angle } = rainbow(index);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const half = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
  return {
    x1: width / 2 - dx * half,
    y1: height / 2 - dy * half,
    x2: width / 2 + dx * half,
    y2: height / 2 + dy * half,
  };
}
