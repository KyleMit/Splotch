import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFiles from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  heldPngFilename,
  MAX_HELD_PNG_ARCHIVE_CHARACTERS,
  serializeHeldPngStorage,
  type HeldPngDelivery,
} from '../export/heldPng';

const RECOVERY_DIRECTORY = 'splotch-png-recovery-v1';
const REVISION_NAME = /^archive-(\d+)\.json$/;
const RETAINED_REVISIONS = 2;
const MAX_RECOVERY_REVISIONS = 3;
const DELIVERY_CACHE_DIRECTORY = 'splotch-png-delivery-v1';
const ATTEMPT_NAME = /^attempt-(\d+)-\d+$/;
const DELIVERY_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_DELIVERY_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_DELIVERY_CACHE_ATTEMPTS = 32;

function attempts(owner: Directory) {
  return owner.list().map((item) => {
    const match = ATTEMPT_NAME.exec(item.name);
    const createdAt = match ? Number(match[1]) : NaN;
    if (!(item instanceof Directory) || !Number.isSafeInteger(createdAt) || createdAt < 0)
      throw new Error('Unexpected PNG export cache entry.');
    return { owner: item, createdAt };
  });
}

function attemptBytes(owner: Directory) {
  return owner.list().reduce((total, file) => {
    if (
      !(file instanceof File) ||
      !file.name.endsWith('.png') ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0
    )
      throw new Error('Unexpected PNG export cache file.');
    return total + file.size;
  }, 0);
}

function pngBytes(base64: string) {
  return (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

function clearAttempt(owner: Directory) {
  try {
    if (owner.exists) owner.delete();
  } catch {
    throw new Error('PNG export cache could not be cleared. The PNG is still held for retry.');
  }
}

function createDeliveryCache() {
  let initialized: Directory | null = null;
  let sequence = 0;
  const active = new Map<string, number>();
  function root() {
    const owner = initialized ?? new Directory(Paths.cache, DELIVERY_CACHE_DIRECTORY);
    owner.create({ intermediates: true, idempotent: true });
    initialized = owner;
    return owner;
  }
  function attemptName() {
    for (let candidate = 0; candidate <= MAX_DELIVERY_CACHE_ATTEMPTS; candidate++) {
      if (!Number.isSafeInteger(++sequence)) throw new Error('PNG export attempts are exhausted.');
      const name = `attempt-${Date.now()}-${sequence}`;
      if (!new Directory(root(), name).exists) return name;
    }
    throw new Error('PNG export cache names are unavailable.');
  }
  return {
    reserve(base64: string) {
      const owner = root();
      const now = Date.now();
      for (const attempt of attempts(owner))
        if (!active.has(attempt.owner.uri) && now - attempt.createdAt >= DELIVERY_RETENTION_MS)
          clearAttempt(attempt.owner);
      const retained = attempts(owner);
      const bytes = retained.reduce(
        (total, attempt) =>
          total + Math.max(attemptBytes(attempt.owner), active.get(attempt.owner.uri) ?? 0),
        0
      );
      if (
        retained.length >= MAX_DELIVERY_CACHE_ATTEMPTS ||
        bytes + pngBytes(base64) > MAX_DELIVERY_CACHE_BYTES
      )
        throw new Error(
          'PNG export storage is full of recent share files. Try again later; this PNG is still held.'
        );
      const attempt = new Directory(owner, attemptName());
      attempt.create();
      active.set(attempt.uri, pngBytes(base64));
      return attempt;
    },
    offer(owner: Directory) {
      const oldUri = owner.uri;
      const bytes = active.get(oldUri);
      if (bytes === undefined) throw new Error('PNG export cache lease is unavailable.');
      owner.rename(attemptName());
      active.delete(oldUri);
      active.set(owner.uri, bytes);
    },
    release(owner: Directory, offeredToSharing: boolean) {
      active.delete(owner.uri);
      if (!offeredToSharing) clearAttempt(owner);
    },
  };
}

function directory() {
  const result = new Directory(Paths.document, RECOVERY_DIRECTORY);
  result.create({ intermediates: true, idempotent: true });
  return result;
}

function revisions(owner: Directory) {
  return owner
    .list()
    .flatMap((item) => {
      if (!(item instanceof File)) throw new Error('Unexpected PNG recovery directory.');
      if (item.name.endsWith('.pending')) return [];
      const match = REVISION_NAME.exec(item.name);
      const revision = match ? Number(match[1]) : NaN;
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new Error('Unexpected PNG recovery file.');
      return [{ file: item, revision }];
    })
    .sort((a, b) => b.revision - a.revision);
}

function reserveRevision(previous: ReturnType<typeof revisions>) {
  if (previous.length < MAX_RECOVERY_REVISIONS) return;
  for (const old of previous.slice(RETAINED_REVISIONS - 1)) old.file.delete();
}

const storage = serializeHeldPngStorage({
  async read() {
    const latest = revisions(directory())[0]?.file;
    if (!latest) return null;
    if (latest.size > MAX_HELD_PNG_ARCHIVE_CHARACTERS)
      throw new Error('PNG recovery data is too large.');
    return latest.text();
  },
  async write(snapshot) {
    if (snapshot.length > MAX_HELD_PNG_ARCHIVE_CHARACTERS)
      throw new Error('PNG recovery data is too large.');
    const owner = directory();
    const previous = revisions(owner);
    reserveRevision(previous);
    const revision = (previous[0]?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('PNG recovery revisions are exhausted.');
    const pending = new File(owner, `archive-${revision}.pending`);
    const pendingUri = pending.uri;
    try {
      if (pending.exists) pending.delete();
      pending.create();
      pending.write(snapshot);
      if ((await pending.text()) !== snapshot)
        throw new Error('PNG recovery write was incomplete.');
      const committed = new File(owner, `archive-${revision}.json`);
      await pending.move(committed);
      if ((await committed.text()) !== snapshot)
        throw new Error('PNG recovery could not be verified.');
    } catch (error) {
      try {
        const unfinished = new File(pendingUri);
        if (unfinished.exists) unfinished.delete();
      } catch {
        // Cleanup cannot replace the write failure or delete a published revision.
      }
      throw error;
    }
    for (const old of previous.slice(RETAINED_REVISIONS - 1)) {
      try {
        old.file.delete();
      } catch {
        // The verified latest revision owns dismissals even when old revisions cannot be pruned.
      }
    }
  },
});

function assertCurrent(isCurrent: () => boolean) {
  if (!isCurrent()) throw new Error('PNG export was cancelled. Your drawing is still here.');
}

function createPngDelivery(): HeldPngDelivery {
  const cache = createDeliveryCache();
  return async (picture, isCurrent) => {
    assertCurrent(isCurrent);
    if (picture.filename !== heldPngFilename(picture.id))
      throw new Error('Invalid PNG export name.');
    const owner = cache.reserve(picture.base64);
    let offeredToSharing = false;
    try {
      const file = new File(owner, picture.filename);
      await LegacyFiles.writeAsStringAsync(file.uri, picture.base64, {
        encoding: LegacyFiles.EncodingType.Base64,
      });
      assertCurrent(isCurrent);
      const readback = await file.base64();
      assertCurrent(isCurrent);
      if (readback !== picture.base64) throw new Error('PNG export write was incomplete.');
      const available = await Sharing.isAvailableAsync();
      assertCurrent(isCurrent);
      if (!available) throw new Error('PNG sharing is unavailable on this device.');
      cache.offer(owner);
      offeredToSharing = true;
      await Sharing.shareAsync(new File(owner, picture.filename).uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Save your picture',
      });
      return 'sharing-closed';
    } finally {
      cache.release(owner, offeredToSharing);
    }
  };
}

const deliver = createPngDelivery();
export const pngRecoveryPlatform = { storage, deliver } as const;
