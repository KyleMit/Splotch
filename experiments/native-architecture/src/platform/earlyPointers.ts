import { EARLY_POINTERS_GLOBAL } from './firstFrameContract';

// Only the web paper input imports this. The prerendered shell's boot script records each pointer
// put down on the paper before the drawing engine listens (tools/migration/prerender-native-web.mjs).
export type EarlyPointer = Readonly<{
  pointerId: number;
  pointerType: string;
  pageX: number;
  pageY: number;
  clientX: number;
  clientY: number;
}>;

const NUMERIC_FIELDS = ['pointerId', 'pageX', 'pageY', 'clientX', 'clientY'] as const;

function isEarlyPointer(value: unknown): value is EarlyPointer {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.pointerType === 'string' &&
    NUMERIC_FIELDS.every((field) => Number.isFinite(record[field]))
  );
}

// The pointers still down, each handed over once: the record is cleared as it is read.
export function takeEarlyPointers(window: Window): EarlyPointer[] {
  const host = window as unknown as Record<string, unknown>;
  const recorded = host[EARLY_POINTERS_GLOBAL];
  delete host[EARLY_POINTERS_GLOBAL];
  if (typeof recorded !== 'object' || recorded === null) return [];
  const pointers = Object.values(recorded);
  if (!pointers.every(isEarlyPointer))
    throw new Error('The shell recorded an early pointer this app cannot read.');
  return pointers;
}
