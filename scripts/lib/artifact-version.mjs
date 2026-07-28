// Reads the version a *built* store artifact actually carries.
//
// The native build output directories are not cleaned between releases, so a
// stale app-release.aab from an older version survives there and is
// indistinguishable from a fresh one by path alone — v1.4.0 shipped a 1.2.0
// bundle exactly that way. Every value here is therefore read out of the
// artifact itself, never inferred from the filename, mtime, or working tree.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;

const ANDROID_MANIFEST = 'base/manifest/AndroidManifest.xml';
const IPA_INFO_PLIST = /^Payload\/[^/]+\.app\/Info\.plist$/;

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

  if (method === 0) return Buffer.from(raw);
  if (method === 8) return inflateRawSync(raw);
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

export function listZipEntries(zipPath) {
  const buf = readFileSync(zipPath);
  const names = [];
  eachCentralDirectoryEntry(buf, ({ name }) => void names.push(name));
  return names;
}

export function readZipEntry(zipPath, matches) {
  const buf = readFileSync(zipPath);
  const test =
    typeof matches === 'string' ? (name) => name === matches : (name) => matches.test(name);

  const found = eachCentralDirectoryEntry(buf, (entry) => (test(entry.name) ? entry : null));
  if (!found) throw new Error(`${zipPath}: no entry matching ${matches}`);

  return inflateEntry(buf, found.localHeaderOffset, found.method, found.compressedSize, found.name);
}

function readVarint(buf, at) {
  let value = 0;
  let shift = 0;
  let p = at;
  for (;;) {
    const byte = buf[p++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: p };
    shift += 7;
  }
}

// aapt2 stores the manifest as an aapt.pb.XmlNode. Within an XmlAttribute the
// name is field 2 and the literal value field 3, emitted adjacently, so a
// targeted scan gets there without pulling in a protobuf runtime to decode a
// schema we need two leaves from.
export function readManifestAttribute(manifest, attribute) {
  const key = Buffer.concat([
    Buffer.from([0x12, attribute.length]), // field 2 (name), length-delimited
    Buffer.from(attribute, 'utf8'),
  ]);
  const at = manifest.indexOf(key);
  if (at < 0) return null;

  let p = at + key.length;
  if (manifest[p] !== 0x1a) return null; // field 3 (value), length-delimited
  const { value: length, next } = readVarint(manifest, p + 1);
  return manifest.subarray(next, next + length).toString('utf8');
}

export function readAabVersion(aabPath) {
  const manifest = readZipEntry(aabPath, ANDROID_MANIFEST);
  const versionName = readManifestAttribute(manifest, 'versionName');
  const versionCode = readManifestAttribute(manifest, 'versionCode');
  if (!versionName) throw new Error(`${aabPath}: no versionName in ${ANDROID_MANIFEST}`);
  return { versionName, versionCode: versionCode ?? null };
}

export function readIpaVersion(ipaPath) {
  const plist = readZipEntry(ipaPath, IPA_INFO_PLIST);
  // Info.plist ships as a binary plist. plutil is the only reader guaranteed
  // present wherever an .ipa can exist at all (building one requires Xcode).
  let json;
  try {
    json = execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: plist });
  } catch (error) {
    throw new Error(
      `${ipaPath}: could not read Info.plist — plutil (macOS) is required to verify an .ipa`,
      { cause: error }
    );
  }
  const info = JSON.parse(json.toString());
  const versionName = info.CFBundleShortVersionString;
  if (!versionName) throw new Error(`${ipaPath}: no CFBundleShortVersionString in Info.plist`);
  return {
    versionName,
    versionCode: info.CFBundleVersion == null ? null : String(info.CFBundleVersion),
  };
}
