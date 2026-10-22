import type { StrokeSize } from './strokeSettings';
import type { PaletteLabel } from '../../../src/lib/palette';

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

export function fitInstructionScene(
  scene: InstructionScene,
  box: Pick<InstructionBox, 'width' | 'height'>
): { scale: number; x: number; y: number };

export function sceneStrokePoints(
  scene: InstructionScene,
  box: Pick<InstructionBox, 'width' | 'height'>,
  stroke: InstructionScene['strokes'][number]
): { x: number; y: number }[];
