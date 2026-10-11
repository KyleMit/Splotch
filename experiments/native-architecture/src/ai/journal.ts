import { isAiStyle, isAiMime, isInstallationId, type AiStyle, type AiMime } from './contract';
export type AiResult = Readonly<{ uri: string; mime: AiMime }>;
export type AiJournal = Readonly<{
  version: 1;
  id: number;
  createdAt: number;
  style: AiStyle;
  originalId: string;
  phase: 'sent' | 'pending' | 'unknown' | 'result' | 'failed';
  jobId: string | null;
  result: AiResult | null;
}>;
export interface AiStorage {
  read(): Promise<AiJournal | null>;
  pictures(): Promise<AiResult[]>;
  write(value: AiJournal): Promise<void>;
  retain(id: number, bytes: Uint8Array, mime: AiMime): Promise<AiResult>;
}
export function parseAiJournal(raw: unknown): AiJournal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('AI recovery data is invalid.');
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !==
      'createdAt,id,jobId,originalId,phase,result,style,version' ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.id) ||
    typeof value.id !== 'number' ||
    value.id < 1 ||
    !Number.isSafeInteger(value.createdAt) ||
    typeof value.createdAt !== 'number' ||
    value.createdAt < 0 ||
    !isAiStyle(value.style) ||
    typeof value.originalId !== 'string' ||
    !/^picture-\d+-[a-z0-9]+$/.test(value.originalId) ||
    !['sent', 'pending', 'unknown', 'result', 'failed'].includes(String(value.phase)) ||
    (value.jobId !== null && !isInstallationId(value.jobId))
  )
    throw new Error('AI recovery data is invalid.');
  const result = value.result;
  if (
    result !== null &&
    (!result ||
      typeof result !== 'object' ||
      !('uri' in result) ||
      typeof result.uri !== 'string' ||
      !result.uri ||
      !('mime' in result) ||
      !isAiMime(result.mime) ||
      Object.keys(result).sort().join(',') !== 'mime,uri')
  )
    throw new Error('AI result recovery data is invalid.');
  if (
    (value.phase === 'result') !== (result !== null) ||
    (value.phase === 'pending' && value.jobId === null)
  )
    throw new Error('AI recovery state is inconsistent.');
  return value as AiJournal;
}
