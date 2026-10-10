import { createPngAlphaDecoder } from '../drawing/pngAlpha';

const MAX_HELD_PNG_COUNT = 3;
export const MAX_HELD_PNG_CHARACTERS = 16 * 1024 * 1024;
const MAX_HELD_PNG_TOTAL_CHARACTERS = 32 * 1024 * 1024;
export const MAX_HELD_PNG_ARCHIVE_CHARACTERS = MAX_HELD_PNG_TOTAL_CHARACTERS + 4096;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PNG_HEADER_CHARACTERS = 32;
const PNG_WIDTH_BYTE = 16;
const PNG_HEIGHT_BYTE = 20;
const MAX_PNG_ID_CHARACTERS = 64;
const PNG_ID = /^png-\d+-[a-z0-9]+$/;

export type HeldPng = Readonly<{ id: string; filename: string; base64: string }>;
export type HeldPngStorage = Readonly<{
  read: () => Promise<string | null>;
  write: (snapshot: string) => Promise<void>;
}>;
export type PngDeliveryResult = 'sharing-closed' | 'download-requested';
export type HeldPngDelivery = (
  picture: HeldPng,
  isCurrent: () => boolean
) => Promise<PngDeliveryResult>;

function invalid(): never {
  throw new Error('The held PNG record is not supported. Your drawing is still here.');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

export function heldPngFilename(id: string) {
  if (id.length > MAX_PNG_ID_CHARACTERS || !PNG_ID.test(id)) invalid();
  return `splotch-${id}.png`;
}

function pngGrid(base64: string) {
  if (
    !base64.startsWith('iVBORw0KGgo') ||
    base64.length < PNG_HEADER_CHARACTERS ||
    base64.length % 4 !== 0
  )
    invalid();
  const header: number[] = [];
  for (let index = 0; index < PNG_HEADER_CHARACTERS; index += 4) {
    const a = BASE64_ALPHABET.indexOf(base64[index]);
    const b = BASE64_ALPHABET.indexOf(base64[index + 1]);
    const c = BASE64_ALPHABET.indexOf(base64[index + 2]);
    const d = BASE64_ALPHABET.indexOf(base64[index + 3]);
    if ([a, b, c, d].some((value) => value < 0)) invalid();
    header.push((a << 2) | (b >>> 4), ((b << 4) | (c >>> 2)) & 255, ((c << 6) | d) & 255);
  }
  const integer = (offset: number) =>
    header[offset] * 0x1000000 +
    (header[offset + 1] << 16) +
    (header[offset + 2] << 8) +
    header[offset + 3];
  return { width: integer(PNG_WIDTH_BYTE), height: integer(PNG_HEIGHT_BYTE) };
}

export async function validateHeldPng(base64: string, isCurrent: () => boolean): Promise<void> {
  if (typeof base64 !== 'string' || base64.length > MAX_HELD_PNG_CHARACTERS)
    throw new Error('This PNG is too large to keep for retry. Your drawing is still here.');
  await createPngAlphaDecoder().decode(base64, pngGrid(base64), isCurrent);
}

export function assertHeldPngCapacity(pictures: readonly HeldPng[]) {
  if (
    pictures.length > MAX_HELD_PNG_COUNT ||
    pictures.reduce((total, picture) => total + picture.base64.length, 0) >
      MAX_HELD_PNG_TOTAL_CHARACTERS
  )
    throw new Error(
      'PNG recovery is full. Try again or dismiss held pictures before exporting another.'
    );
}

function readHeldPng(value: unknown): HeldPng {
  if (
    !record(value) ||
    !exactKeys(value, ['id', 'filename', 'base64']) ||
    typeof value.id !== 'string' ||
    typeof value.filename !== 'string' ||
    value.filename !== heldPngFilename(value.id) ||
    typeof value.base64 !== 'string'
  )
    invalid();
  return { id: value.id, filename: value.filename, base64: value.base64 };
}

export function serializeHeldPngs(pictures: readonly HeldPng[]) {
  assertHeldPngCapacity(pictures);
  return JSON.stringify({ version: 1, pictures });
}

export async function parseHeldPngs(
  snapshot: string | null,
  isCurrent: () => boolean
): Promise<readonly HeldPng[]> {
  if (snapshot === null) return [];
  if (snapshot.length > MAX_HELD_PNG_ARCHIVE_CHARACTERS) invalid();
  const value: unknown = JSON.parse(snapshot);
  if (
    !record(value) ||
    !exactKeys(value, ['version', 'pictures']) ||
    value.version !== 1 ||
    !Array.isArray(value.pictures)
  )
    invalid();
  const pictures = value.pictures.map(readHeldPng);
  assertHeldPngCapacity(pictures);
  if (
    new Set(pictures.map((picture) => picture.id)).size !== pictures.length ||
    new Set(pictures.map((picture) => picture.base64)).size !== pictures.length
  )
    invalid();
  for (const picture of pictures) await validateHeldPng(picture.base64, isCurrent);
  return pictures;
}

export function serializeHeldPngStorage(storage: HeldPngStorage): HeldPngStorage {
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
