export type DrawingBackend = 'legacy' | 'recorded';

export function readDrawingBackend(value: string | undefined): DrawingBackend {
  if (value === undefined || value === 'legacy') return 'legacy';
  if (value === 'recorded') return 'recorded';
  throw new Error('EXPO_PUBLIC_DRAWING_BACKEND must be legacy or recorded.');
}

export const DRAWING_BACKEND = readDrawingBackend(process.env.EXPO_PUBLIC_DRAWING_BACKEND);
