// Read-only zip container access: list the entries an archive declares, and
// inflate one of them.
//
// Sized to what verifying a store artifact needs and no further — no writing,
// no streaming, no zip64. A dependency would carry all three plus a decompressor
// this already gets from node:zlib, so the seam is kept local; `readEntry`
// deliberately re-reads the file per call, because callers want one or two
// entries out of an archive they never open again.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;

const STORED = 0;
const DEFLATED = 8;

function findEndOfCentralDirectory(buf) {
  // The EOCD is last but for a trailing comment of up to 0xffff bytes.
  const earliest = Math.max(0, buf.length - 22 - 0xffff);
  for (let at = buf.length - 22; at >= earliest; at--) {
    if (buf.readUInt32LE(at) === EOCD_SIG) return at;
  }
  return -1;
}

function inflateEntry(buf, localHeaderOffset, method, compressedSize, name) {
  if (buf.readUInt32LE(localHeaderOffset) !== LOCAL_SIG) {
    throw new Error(`corrupt zip: no local header for ${name}`);
  }
  // The local header's own sizes are zero when a data descriptor follows, so the
  // compressed size has to come from the central directory.
  const nameLength = buf.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buf.readUInt16LE(localHeaderOffset + 28);
  const start = localHeaderOffset + 30 + nameLength + extraLength;
  const raw = buf.subarray(start, start + compressedSize);

  if (method === STORED) return Buffer.from(raw);
  if (method === DEFLATED) return inflateRawSync(raw);
  throw new Error(`unsupported zip compression method ${method} for ${name}`);
}

// Walks the central directory rather than scanning for local-header signatures,
// so a filename that happens to appear inside compressed data can't match.
function eachCentralDirectoryEntry(buf, visit) {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');

  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset === ZIP64_SENTINEL) throw new Error('zip64 archives are not supported');

  let at = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== CD_SIG) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(at + 10);
    const compressedSize = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const localHeaderOffset = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString('utf8');

    const done = visit({ name, method, compressedSize, localHeaderOffset });
    if (done) return done;

    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** Every entry name the archive's central directory declares, in stored order. */
export function listEntries(zipPath) {
  const buf = readFileSync(zipPath);
  const names = [];
  eachCentralDirectoryEntry(buf, ({ name }) => void names.push(name));
  return names;
}

/**
 * The decompressed bytes of the first entry matching `matches` — an exact name
 * or a RegExp. Throws rather than returning empty when nothing matches, so a
 * caller reading a version out of an archive cannot mistake absence for a value.
 */
export function readEntry(zipPath, matches) {
  const buf = readFileSync(zipPath);
  const test =
    typeof matches === 'string' ? (name) => name === matches : (name) => matches.test(name);

  const found = eachCentralDirectoryEntry(buf, (entry) => (test(entry.name) ? entry : null));
  if (!found) throw new Error(`${zipPath}: no entry matching ${matches}`);

  return inflateEntry(buf, found.localHeaderOffset, found.method, found.compressedSize, found.name);
}
