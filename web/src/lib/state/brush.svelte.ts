// The pen's texture style. 'crayon' is the shipped default — a waxy brush that
// catches on the paper tooth and builds up on repeated same-colour passes (see
// crayonBrush.ts); 'marker' is the original flat solid pen, kept as an A/B
// comparison variant (the engine's own built-in default is 'marker', so the
// /dev/engine harness stays flat unless a test opts in via setBrush).
//
// This only styles the pen; the eraser and magic brush are unaffected (they
// ignore the brush stamp). Not persisted — it's a fixed product decision today,
// with the marker retained so the two can be compared.
import type { BrushKind } from '../drawing/strokeOps';

export type BrushStyle = 'crayon' | 'marker';

export const brushState = $state<{ style: BrushStyle }>({
  style: 'crayon',
});

// Map the UI style to the engine's brush stamp (marker = the flat default =
// undefined stamp).
export function engineBrushFor(style: BrushStyle): BrushKind | undefined {
  return style === 'crayon' ? 'crayon' : undefined;
}
