import { OFFLINE_BOOKS } from './books.generated';

import { isOfflineBookId, type OfflineBookId } from './identity';
export type { OfflineBookId, OfflinePageId, OfflinePageSlug } from './identity';
export { isOfflinePageId, pageReference, offlinePageId } from './identity';
export type PackResolution = 'compact' | 'full';
export type PackFile = Readonly<{
  path: string;
  downloadPath: string;
  bytes: number;
  sha256: string;
}>;
export type Pack = Readonly<{
  id: OfflineBookId;
  revision: string;
  bytes: number;
  files: readonly PackFile[];
}>;
export const PACK_ORIGIN = 'https://splotch.art';
export const MAX_PACK_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PACK_BYTES = 16 * 1024 * 1024;
const PACK_FILE_COUNT = 74;
const DIGEST = /^[a-f0-9]{64}$/;

export function approvedAssetUrl(path: string): string {
  if (
    path.includes('..') ||
    !/^\/coloring\/(?:max-1152px\/)?[a-z]+\/[a-z0-9.-]+\.(?:webp|svg)$/.test(path)
  )
    throw new Error('Unapproved coloring asset path.');
  return `${PACK_ORIGIN}${path}`;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parsePack(value: unknown): Pack {
  if (
    !record(value) ||
    !isOfflineBookId(value.id) ||
    typeof value.revision !== 'string' ||
    !DIGEST.test(value.revision) ||
    !Number.isSafeInteger(value.bytes) ||
    typeof value.bytes !== 'number' ||
    value.bytes <= 0 ||
    value.bytes > MAX_PACK_BYTES ||
    !Array.isArray(value.files) ||
    value.files.length !== PACK_FILE_COUNT
  )
    throw new Error('Invalid coloring pack manifest.');
  const prefix = `/coloring/${value.id}/`;
  const paths = new Set<string>();
  let total = 0;
  const files = value.files.map((file: unknown): PackFile => {
    if (
      !record(file) ||
      typeof file.path !== 'string' ||
      typeof file.downloadPath !== 'string' ||
      !file.path.startsWith(prefix) ||
      paths.has(file.path) ||
      typeof file.bytes !== 'number' ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      file.bytes > MAX_PACK_FILE_BYTES ||
      typeof file.sha256 !== 'string' ||
      !DIGEST.test(file.sha256)
    )
      throw new Error('Invalid coloring pack file.');
    approvedAssetUrl(file.path);
    approvedAssetUrl(file.downloadPath);
    if (
      file.downloadPath !== file.path &&
      (!/\.(light|night)\.webp$/.test(file.path) ||
        file.downloadPath !== file.path.replace('/coloring/', '/coloring/max-1152px/'))
    )
      throw new Error('Invalid coloring pack variant.');
    paths.add(file.path);
    total += file.bytes;
    return {
      path: file.path,
      downloadPath: file.downloadPath,
      bytes: file.bytes,
      sha256: file.sha256,
    };
  });
  const book = OFFLINE_BOOKS.find((book) => book.id === value.id);
  const expected =
    book?.pages.flatMap(({ slug }) =>
      ['tall', 'wide'].flatMap((orientation) =>
        [
          'light.webp',
          'night.webp',
          'overlay.svg',
          'dark.overlay.svg',
          'selector.webp',
          'dark.selector.webp',
        ].map((suffix) => `${prefix}${slug}-${orientation}.${suffix}`)
      )
    ) ?? [];
  expected.push(`${prefix}cover.thumb.webp`, `${prefix}cover.chalk.thumb.webp`);
  if (total !== value.bytes || expected.some((path) => !paths.has(path)))
    throw new Error('Incomplete coloring pack manifest.');
  return { id: value.id, revision: value.revision, bytes: value.bytes, files };
}
