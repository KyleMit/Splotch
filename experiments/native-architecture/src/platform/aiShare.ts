import type { Directory } from 'expo-file-system';
import { aiStorage, admitAiImage } from './ai';
import { MAX_RESULT_BYTES, type AiMime } from '../ai/contract';
import type { AiResult } from '../ai/journal';

const SHARE_CACHE_DIRECTORY = 'splotch-ai-share-v1';
const SHARE_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_SHARE_CACHE_BYTES = 48 * 1024 * 1024;
const MAX_SHARE_ATTEMPTS = 8;
const ATTEMPT_NAME = /^attempt-(\d+)-\d+$/;
const IMAGE_NAME = /^picture\.(png|jpg|webp)$/;
const SHARE_FORMATS: Record<
  AiMime,
  {
    extension: 'png' | 'jpg' | 'webp';
    uti: 'public.png' | 'public.jpeg' | 'org.webmproject.webp';
  }
> = {
  'image/png': { extension: 'png', uti: 'public.png' },
  'image/jpeg': { extension: 'jpg', uti: 'public.jpeg' },
  'image/webp': { extension: 'webp', uti: 'org.webmproject.webp' },
};

function assertCurrent(isCurrent: () => boolean) {
  if (!isCurrent()) throw new Error('AI picture sharing was cancelled.');
}

function createShareCache(fs: typeof import('expo-file-system')) {
  const root = new fs.Directory(fs.Paths.cache, SHARE_CACHE_DIRECTORY);
  root.create({ intermediates: true, idempotent: true });
  let sequence = 0;
  function nextName() {
    for (let index = 0; index <= MAX_SHARE_ATTEMPTS; index++) {
      if (!Number.isSafeInteger(++sequence)) throw new Error('AI share attempts are exhausted.');
      const name = `attempt-${Date.now()}-${sequence}`;
      if (!new fs.Directory(root, name).exists) return name;
    }
    throw new Error('AI share cache names are unavailable.');
  }
  return {
    reserve(byteLength: number) {
      const entries = root.list().map((item) => {
        const match = ATTEMPT_NAME.exec(item.name);
        const createdAt = match ? Number(match[1]) : NaN;
        if (!(item instanceof fs.Directory) || !Number.isSafeInteger(createdAt) || createdAt < 0)
          throw new Error('Unexpected AI share cache entry.');
        const files = item.list();
        if (files.length > 1) throw new Error('Unexpected AI share cache file.');
        const bytes = files.reduce((total, file) => {
          if (
            !(file instanceof fs.File) ||
            !IMAGE_NAME.test(file.name) ||
            !Number.isSafeInteger(file.size) ||
            file.size < 0 ||
            file.size > MAX_RESULT_BYTES
          )
            throw new Error('Unexpected AI share cache file.');
          return total + file.size;
        }, 0);
        return { directory: item, createdAt, bytes };
      });
      const now = Date.now();
      const retained = entries.filter((entry) => {
        if (now - entry.createdAt < SHARE_RETENTION_MS) return true;
        entry.directory.delete();
        return false;
      });
      if (
        retained.length >= MAX_SHARE_ATTEMPTS ||
        retained.reduce((total, item) => total + item.bytes, 0) + byteLength > MAX_SHARE_CACHE_BYTES
      )
        throw new Error('Recent AI share files fill the sharing cache. Try again later.');
      const attempt = new fs.Directory(root, nextName());
      attempt.create();
      return attempt;
    },
    offer(attempt: Directory) {
      attempt.rename(nextName());
    },
  };
}

function createAiPictureShare() {
  let busy = false;
  return async (picture: AiResult, isCurrent: () => boolean): Promise<void> => {
    if (busy) throw new Error('Another AI picture share is still open.');
    busy = true;
    let attempt: Directory | null = null;
    let offered = false;
    try {
      assertCurrent(isCurrent);
      if (!picture.uri.startsWith('file:'))
        throw new Error('Save this AI picture before sharing it.');
      const [fs, sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
      assertCurrent(isCurrent);
      const owned = await aiStorage.pictures();
      assertCurrent(isCurrent);
      if (!owned.some((value) => value.uri === picture.uri && value.mime === picture.mime))
        throw new Error('Reopen a saved AI picture before sharing it.');
      const source = new fs.File(picture.uri);
      if (!source.exists || source.size <= 0 || source.size > MAX_RESULT_BYTES)
        throw new Error('Saved AI picture is missing or too large.');
      const bytes = await source.bytes();
      assertCurrent(isCurrent);
      if (!bytes.length || bytes.length > MAX_RESULT_BYTES)
        throw new Error('Saved AI picture is too large.');
      await admitAiImage(bytes, picture.mime);
      assertCurrent(isCurrent);
      const available = await sharing.isAvailableAsync();
      assertCurrent(isCurrent);
      if (!available) throw new Error('AI picture sharing is unavailable on this device.');
      const cache = createShareCache(fs);
      attempt = cache.reserve(bytes.length);
      const format = SHARE_FORMATS[picture.mime];
      const filename = `picture.${format.extension}`;
      const file = new fs.File(attempt, filename);
      file.create();
      file.write(bytes);
      const readback = await file.bytes();
      assertCurrent(isCurrent);
      if (
        readback.length !== bytes.length ||
        !readback.every((value, index) => value === bytes[index])
      )
        throw new Error('AI share copy could not be verified.');
      cache.offer(attempt);
      assertCurrent(isCurrent);
      offered = true;
      await sharing.shareAsync(new fs.File(attempt, filename).uri, {
        mimeType: picture.mime,
        UTI: format.uti,
        dialogTitle: 'Share AI picture',
      });
      assertCurrent(isCurrent);
    } finally {
      try {
        if (attempt && !offered && attempt.exists) attempt.delete();
      } finally {
        busy = false;
      }
    }
  };
}

export const shareAiPicture = createAiPictureShare();
