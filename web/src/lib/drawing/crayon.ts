export const CRAYON_VARIANTS = ['solid', 'phase-tooth'] as const;

export type CrayonVariant = (typeof CRAYON_VARIANTS)[number];

const TOOTH_SIZE = 17;
const TOOTH_PHASES = 5;

export function toothAlphaAt(x: number, y: number, pass: number): number {
  const phase = ((pass % TOOTH_PHASES) + TOOTH_PHASES) % TOOTH_PHASES;
  const value = (x * 29 + y * 17 + x * y * 7 + phase * 19) % 23;
  if (value < 3) return 0.52;
  if (value < 7) return 0.7;
  if (value < 11) return 0.86;
  return 1;
}

export function toothSize(): number {
  return TOOTH_SIZE;
}
