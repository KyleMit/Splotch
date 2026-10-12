import { parseDrawing, type Drawing } from '../drawing/model';

export const MAX_DRAFT_BYTES = 8 * 1024 * 1024;
export type DrawingDraftStorage = {
  read: () => Promise<string | null>;
  write: (snapshot: string) => Promise<void>;
};

export function encodeDrawingDraft(drawing: Drawing): string {
  const snapshot = JSON.stringify({ version: 1, drawing: parseDrawing(drawing) });
  if (snapshot.length > MAX_DRAFT_BYTES) throw new Error('The current draft is too large.');
  return snapshot;
}

export function decodeDrawingDraft(snapshot: string | null): Drawing | null {
  if (snapshot === null) return null;
  if (snapshot.length > MAX_DRAFT_BYTES) throw new Error('The current draft is too large.');
  const value: unknown = JSON.parse(snapshot);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'drawing,version' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('drawing' in value)
  )
    throw new Error('The current draft is not in the saved format.');
  return parseDrawing(value.drawing);
}

export function serializeDrawingDraftStorage(storage: DrawingDraftStorage): DrawingDraftStorage {
  let pending = Promise.resolve();
  function run<T>(action: () => Promise<T>): Promise<T> {
    const result = pending.then(action);
    pending = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
  return {
    read: () => run(storage.read),
    write: (snapshot) => run(() => storage.write(snapshot)),
  };
}
