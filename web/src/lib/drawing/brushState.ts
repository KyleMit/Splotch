import type { BrushType } from '$lib/state/tool.svelte';

interface StrokeStyle {
  color: string;
  erase: boolean;
  magic: boolean;
  crayon: boolean;
  seed: number;
}

export function strokeStyleOf(state: StrokeStyle): StrokeStyle {
  const { color, erase, magic, crayon, seed } = state;
  return { color, erase, magic, crayon, seed };
}

export function brushModeOf(magic: boolean, crayon: boolean, eraser: boolean): BrushType {
  if (magic) return 'magic';
  if (crayon && !eraser) return 'crayon';
  return eraser ? 'eraser' : 'pen';
}
