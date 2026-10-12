import { decodeDrawingDraft } from '../product/drawingDraft';
import type { DrawingBackend } from '../product/drawingBackend';

export const DRAFT_DATABASE = 'splotch-beta-current-draft-v1';
export const DRAFT_STORE = 'drafts';
export const LEGACY_DRAFT_KEYS: Record<DrawingBackend, string> = {
  legacy: 'splotch-candidate:current-draft-v1',
  recorded: 'splotch-candidate:recorded-current-draft-v1',
};
const AUTHORITY_KEYS: Record<DrawingBackend, string> = {
  legacy: 'splotch-beta:current-draft-idb-v1',
  recorded: 'splotch-beta:recorded-current-draft-idb-v1',
};
const AUTHORITY_VALUE = '1';
const COMMIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type WebDrawingDraftRecord = Readonly<{
  version: 1;
  revision: number;
  commitId: string;
  snapshot: string | null;
}>;

export function invalidDraftRecord(): never {
  throw new Error('The stored current draft could not be checked.');
}

export function parseDraftRecord(raw: unknown): WebDrawingDraftRecord {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).sort().join(',') !== 'commitId,revision,snapshot,version' ||
    !('version' in raw) ||
    raw.version !== 1 ||
    !('revision' in raw) ||
    typeof raw.revision !== 'number' ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1 ||
    !('commitId' in raw) ||
    typeof raw.commitId !== 'string' ||
    !COMMIT_ID.test(raw.commitId) ||
    !('snapshot' in raw) ||
    (raw.snapshot !== null && typeof raw.snapshot !== 'string')
  )
    invalidDraftRecord();
  decodeDrawingDraft(raw.snapshot);
  return { version: 1, revision: raw.revision, commitId: raw.commitId, snapshot: raw.snapshot };
}

export function sameDraftRecord(a: WebDrawingDraftRecord, b: WebDrawingDraftRecord): boolean {
  return a.revision === b.revision && a.commitId === b.commitId && a.snapshot === b.snapshot;
}

export function hasDraftAuthority(backend: DrawingBackend): boolean {
  const marker = localStorage.getItem(AUTHORITY_KEYS[backend]);
  if (marker !== null && marker !== AUTHORITY_VALUE) invalidDraftRecord();
  return marker === AUTHORITY_VALUE;
}

export function claimDraftAuthority(backend: DrawingBackend): void {
  if (hasDraftAuthority(backend)) return;
  // Claim before the IDB commit so a later missing record cannot resurrect a stale backup.
  localStorage.setItem(AUTHORITY_KEYS[backend], AUTHORITY_VALUE);
  if (!hasDraftAuthority(backend)) invalidDraftRecord();
}

export function readLegacyDraft(backend: DrawingBackend): string | null {
  const snapshot = localStorage.getItem(LEGACY_DRAFT_KEYS[backend]);
  decodeDrawingDraft(snapshot);
  return snapshot;
}

export function newDraftRecord(revision: number, snapshot: string | null): WebDrawingDraftRecord {
  return parseDraftRecord({ version: 1, revision, commitId: crypto.randomUUID(), snapshot });
}
