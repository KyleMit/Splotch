import type { Page } from '@playwright/test';
import type { PaletteLabel } from '../../../web/src/lib/palette';
import type { StrokeSize } from '../../../web/src/lib/state/strokeWidth.svelte';

export interface InstructionBox {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface InstructionScene {
  colors: ({ kind: 'palette'; label: PaletteLabel } | { kind: 'picker'; hex: string })[];
  height: number;
  strokes: { color: number; points: number[]; size: StrokeSize }[];
  width: number;
}

export function drawInstructionScene(
  page: Page,
  box: InstructionBox,
  scene: InstructionScene,
  options?: { brush?: 'crayon' | 'magic' | 'pen'; replay?: 'engine' | 'pointer' }
): Promise<void>;
