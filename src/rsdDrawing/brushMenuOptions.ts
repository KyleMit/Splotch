import type { Brush } from '../drawing/brushes';
import type { NativeIconName } from './icons.generated';

// The shipping Brush Menu's entries (tool.svelte.ts BRUSH_OPTIONS), whose labels differ from the
// candidate's own brush names; rsd-native-actions-panel.test.mjs reads them from the source.
export const BRUSH_MENU_OPTIONS = {
  pen: { icon: 'brush-pen', label: 'Pen' },
  crayon: { icon: 'brush-crayon', label: 'Crayon' },
  magic: { icon: 'brush-magic', label: 'Magic brush' },
  eraser: { icon: 'brush-eraser', label: 'Eraser' },
} as const satisfies Record<Brush, { icon: NativeIconName; label: string }>;
