import { DEFAULT_STROKE_WIDTH, STROKE_WIDTH_PX } from './strokeWidth';
import { createRainbowGradient, MAGIC_GRADIENT_COUNT } from '../lib/drawing/magicSheetGradient';

export const BRUSHES = {
  pen: { label: 'Pen', width: STROKE_WIDTH_PX.pen[DEFAULT_STROKE_WIDTH] },
  crayon: { label: 'Crayon', width: STROKE_WIDTH_PX.crayon[DEFAULT_STROKE_WIDTH] },
  magic: { label: 'Magic Brush', width: STROKE_WIDTH_PX.magic[DEFAULT_STROKE_WIDTH] },
  eraser: { label: 'Eraser', width: STROKE_WIDTH_PX.eraser[DEFAULT_STROKE_WIDTH] },
} as const;

export const BRUSH_ORDER = ['pen', 'crayon', 'magic', 'eraser'] as const;
export type Brush = (typeof BRUSH_ORDER)[number];
export type LegacySolidBrush = 'pencil' | 'marker';
export type StoredBrush = Brush | LegacySolidBrush;
export const DEFAULT_BRUSH: Brush = 'pen';
export const MAGIC_RAINBOW_COUNT = MAGIC_GRADIENT_COUNT;
export const INITIAL_RAINBOW = 0;
export const MAX_CRAYON_SEED = 0xffffffff;

type RainbowStop = Readonly<{ offset: number; color: string }>;
export type Rainbow = Readonly<{ angle: number; stops: readonly RainbowStop[] }>;

function createRainbowPool() {
  let pool: readonly Rainbow[] | null = null;
  return () => {
    pool ??= Array.from({ length: MAGIC_RAINBOW_COUNT }, () => createRainbowGradient());
    return pool;
  };
}

const rainbowPool = createRainbowPool();

export function pickRainbow() {
  return Math.floor(Math.random() * MAGIC_RAINBOW_COUNT);
}

export function rainbow(index: number): Rainbow {
  return rainbowPool()[index];
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
