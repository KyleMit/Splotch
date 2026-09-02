// Reads the version a *built* store artifact actually carries.
//
// The native build output directories are not cleaned between releases, so a
// stale app-release.aab from an older version survives there and is
// indistinguishable from a fresh one by path alone — v1.4.0 shipped a 1.2.0
// bundle exactly that way. Every value here is therefore read out of the
// artifact itself, never inferred from the filename, mtime, or working tree.

import { execFileSync } from 'node:child_process';

import { readEntry } from './zip.mjs';

const ANDROID_MANIFEST = 'base/manifest/AndroidManifest.xml';
const IPA_INFO_PLIST = /^Payload\/[^/]+\.app\/Info\.plist$/;

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

  const p = at + key.length;
  if (manifest[p] !== 0x1a) return null; // field 3 (value), length-delimited
  const { value: length, next } = readVarint(manifest, p + 1);
  return manifest.subarray(next, next + length).toString('utf8');
}

export function readAabVersion(aabPath) {
  const manifest = readEntry(aabPath, ANDROID_MANIFEST);
  const versionName = readManifestAttribute(manifest, 'versionName');
  const versionCode = readManifestAttribute(manifest, 'versionCode');
  if (!versionName) throw new Error(`${aabPath}: no versionName in ${ANDROID_MANIFEST}`);
  return { versionName, versionCode: versionCode ?? null };
}

export function readIpaVersion(ipaPath) {
  const plist = readEntry(ipaPath, IPA_INFO_PLIST);
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
