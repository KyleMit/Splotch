import { getStore } from '@netlify/blobs';
import type { StyleName } from '../ai/styles';
import { IMAGE_REPORT_RETENTION_DAYS } from '../imageReport';

export const IMAGE_REPORT_STORE_NAME = 'ai-image-reports';
export { IMAGE_REPORT_RETENTION_DAYS } from '../imageReport';

const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_RETENTION_MS = IMAGE_REPORT_RETENTION_DAYS * DAY_MS;
const REPORT_ID_PATTERN = /^(\d+)-[0-9a-f-]+\//;

interface ImageReportMetadata {
  version: 1;
  reportedAt: string;
  deleteAfter: string;
  style: StyleName | null;
  inputContentType: string;
  outputContentType: string;
}

export interface SaveImageReportInput {
  input: Blob;
  output: Blob;
  prompt: string;
  style: StyleName | null;
}

export interface SavedImageReport {
  reportId: string;
  keyPrefix: string;
  keys: string[];
  reportedAt: string;
  deleteAfter: string;
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return 'png';
}

function keysFor(reportId: string, inputType: string, outputType: string) {
  const keyPrefix = `${reportId}/`;
  return {
    keyPrefix,
    input: `${keyPrefix}input.${extensionFor(inputType)}`,
    output: `${keyPrefix}output.${extensionFor(outputType)}`,
    prompt: `${keyPrefix}prompt.txt`,
    metadata: `${keyPrefix}metadata.json`,
  };
}

export async function deleteImageReport(report: SavedImageReport): Promise<void> {
  const store = getStore(IMAGE_REPORT_STORE_NAME);
  await Promise.all(report.keys.map((key) => store.delete(key)));
}

export async function saveImageReport(input: SaveImageReportInput): Promise<SavedImageReport> {
  const now = Date.now();
  const reportedAt = new Date(now).toISOString();
  const deleteAfter = new Date(now + REPORT_RETENTION_MS).toISOString();
  const reportId = `${now}-${crypto.randomUUID()}`;
  const keys = keysFor(reportId, input.input.type, input.output.type);
  const metadata: ImageReportMetadata = {
    version: 1,
    reportedAt,
    deleteAfter,
    style: input.style,
    inputContentType: input.input.type,
    outputContentType: input.output.type,
  };
  const store = getStore(IMAGE_REPORT_STORE_NAME);
  const writes = await Promise.allSettled([
    store.set(keys.input, input.input, { onlyIfNew: true }),
    store.set(keys.output, input.output, { onlyIfNew: true }),
    store.set(keys.prompt, input.prompt, { onlyIfNew: true }),
    store.setJSON(keys.metadata, metadata, { onlyIfNew: true }),
  ]);
  const failed = writes.some(
    (write) =>
      write.status === 'rejected' || (write.status === 'fulfilled' && !write.value.modified)
  );
  const saved = {
    reportId,
    keyPrefix: keys.keyPrefix,
    keys: [keys.input, keys.output, keys.prompt, keys.metadata],
    reportedAt,
    deleteAfter,
  };
  if (failed) {
    await deleteImageReport(saved).catch(() => {});
    throw new Error('Could not persist the complete AI image report');
  }
  return saved;
}

export async function purgeExpiredImageReports(): Promise<{
  deletedBlobs: number;
  expiredReports: number;
}> {
  const cutoff = Date.now() - REPORT_RETENTION_MS;
  const store = getStore(IMAGE_REPORT_STORE_NAME);
  const expiredReportIds = new Set<string>();
  let deletedBlobs = 0;

  for await (const page of store.list({ paginate: true })) {
    const expiredKeys = page.blobs.filter(({ key }) => {
      const match = REPORT_ID_PATTERN.exec(key);
      if (!match || Number(match[1]) > cutoff) return false;
      expiredReportIds.add(key.slice(0, key.indexOf('/')));
      return true;
    });
    await Promise.all(expiredKeys.map(({ key }) => store.delete(key)));
    deletedBlobs += expiredKeys.length;
  }

  return { deletedBlobs, expiredReports: expiredReportIds.size };
}
