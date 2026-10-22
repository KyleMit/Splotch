import { LARGE_TABLET_MIN_SIDE_PX, TABLET_MIN_SIDE_PX } from '../lib/breakpoints';

// AiImagePrompt.svelte's card at each of its viewport steps: the base phone card, the short
// viewport that trims chrome, and the roomy and large-tablet steps that grow the covers.
// native-ai-flow-geometry.test.mjs reads every value back out of the shipping stylesheet.
const AI_PROMPT_SHORT_MAX_HEIGHT_PX = 560;
const AI_PROMPT_NARROW_MAX_WIDTH_PX = 420;
const AI_PROMPT_COLUMNS = { narrow: 2, wide: 4 } as const;

export type AiPromptStep = 'base' | 'short' | 'roomy' | 'large';

type Box = { top: number; inline: number; bottom: number };

export type AiPromptLayout = Readonly<{
  maxWidth: number;
  maxHeightFraction: number;
  padding: Box;
  gap: number;
  closeInset: number;
  legendSize: 'sm' | 'md';
  legendGap: number;
  gridGap: number;
  labelSize: 'sm' | 'md';
}>;

export const AI_PROMPT_LAYOUTS: Record<AiPromptStep, AiPromptLayout> = {
  base: {
    maxWidth: 480,
    maxHeightFraction: 0.9,
    padding: { top: 28, inline: 24, bottom: 24 },
    gap: 16,
    closeInset: 12,
    legendSize: 'sm',
    legendGap: 12,
    gridGap: 12,
    labelSize: 'sm',
  },
  short: {
    maxWidth: 480,
    maxHeightFraction: 0.94,
    padding: { top: 16, inline: 16, bottom: 14 },
    gap: 10,
    closeInset: 12,
    legendSize: 'sm',
    legendGap: 8,
    gridGap: 8,
    labelSize: 'sm',
  },
  roomy: {
    maxWidth: 660,
    maxHeightFraction: 0.9,
    padding: { top: 32, inline: 24, bottom: 24 },
    gap: 20,
    closeInset: 16,
    legendSize: 'md',
    legendGap: 16,
    gridGap: 16,
    labelSize: 'md',
  },
  large: {
    maxWidth: 820,
    maxHeightFraction: 0.9,
    padding: { top: 40, inline: 32, bottom: 32 },
    gap: 24,
    closeInset: 16,
    legendSize: 'md',
    legendGap: 16,
    gridGap: 20,
    labelSize: 'md',
  },
};

type Window = { width: number; height: number };

export function aiPromptStep({ width, height }: Window): AiPromptStep {
  if (width >= LARGE_TABLET_MIN_SIDE_PX && height >= LARGE_TABLET_MIN_SIDE_PX) return 'large';
  if (width >= TABLET_MIN_SIDE_PX && height >= TABLET_MIN_SIDE_PX) return 'roomy';
  return height <= AI_PROMPT_SHORT_MAX_HEIGHT_PX ? 'short' : 'base';
}

export function aiPromptColumns({ width }: Window) {
  return width <= AI_PROMPT_NARROW_MAX_WIDTH_PX ? AI_PROMPT_COLUMNS.narrow : AI_PROMPT_COLUMNS.wide;
}
