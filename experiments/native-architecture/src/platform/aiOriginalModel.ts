import { parseDrawing } from '../drawing/model';

export const MAX_AI_MODEL_BYTES = 8 * 1024 * 1024;
export const AI_ORIGINAL_CURRENT_VERSIONS = [5, 7] as const;
export const AI_ORIGINAL_IMPORT_VERSIONS = [1, 2, 3, 4, 5, 7] as const;
type OriginalAdmission = 'current' | 'imported';

export function validateAiOriginalModel(originalModel: string, admission: OriginalAdmission): void {
  if (
    typeof originalModel !== 'string' ||
    !originalModel.length ||
    new TextEncoder().encode(originalModel).length > MAX_AI_MODEL_BYTES
  )
    throw new Error('AI original drawing is missing or too large.');
  const value: unknown = JSON.parse(originalModel);
  parseDrawing(value);
  if (typeof value !== 'object' || value === null || !('version' in value))
    throw new Error('AI original drawing is invalid.');
  const versions: readonly number[] =
    admission === 'current' ? AI_ORIGINAL_CURRENT_VERSIONS : AI_ORIGINAL_IMPORT_VERSIONS;
  if (typeof value.version !== 'number' || !versions.includes(value.version))
    throw new Error('AI original drawing format is unavailable.');
}
