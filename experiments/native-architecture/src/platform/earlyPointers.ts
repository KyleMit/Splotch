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

// The pointers still down, each handed over once. The record is emptied in place rather than
// removed: the shell's listeners keep writing to that one object for the page's life, so a paper
// mounted later still takes the fingers that land while it waits for its engine.
export function takeEarlyPointers(window: Window): EarlyPointer[] {
  const recorded = (window as unknown as Record<string, unknown>)[EARLY_POINTERS_GLOBAL];
  if (typeof recorded !== 'object' || recorded === null) return [];
  const record = recorded as Record<string, unknown>;
  const pointers = Object.values(record);
  for (const key of Object.keys(record)) delete record[key];
  if (!pointers.every(isEarlyPointer))
    throw new Error('The shell recorded an early pointer this app cannot read.');
  return pointers;
}
