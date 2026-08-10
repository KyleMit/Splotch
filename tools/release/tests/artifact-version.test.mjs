import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import {
  listZipEntries,
  readAabVersion,
  readManifestAttribute,
  readZipEntry,
} from '../lib/artifact-version.mjs';

// Minimal zip writer, mirroring the reader under test. CRCs are left zero: the
// reader locates entries through the central directory and inflates them, and
// never validates a checksum, so a real one would prove nothing here.
function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const { name, data, store = false } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const payload = store ? data : deflateRawSync(data);
    const method = store ? 0 : 8;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, payload);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(payload.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += header.length + nameBuf.length + payload.length;
  }

  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, directory, eocd]);
}

function varint(value) {
  const bytes = [];
  let n = value;
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return Buffer.from(bytes);
}

// The aapt.pb.XmlAttribute shape the reader scans for: name in field 2, literal
// value in field 3. Byte-for-byte what a real aapt2 manifest emits.
function attribute(name, value) {
  const nameBuf = Buffer.from(name, 'utf8');
  const valueBuf = Buffer.from(value, 'utf8');
  return Buffer.concat([
    Buffer.from([0x12]),
    varint(nameBuf.length),
    nameBuf,
    Buffer.from([0x1a]),
    varint(valueBuf.length),
    valueBuf,
  ]);
}

let dir;
const aabPath = () => join(dir, 'app-release.aab');

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'splotch-artifact-'));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('readAabVersion', () => {
  it('reads versionName and versionCode out of the protobuf manifest', () => {
    const manifest = Buffer.concat([
      Buffer.from('android'),
      attribute('compileSdkVersion', '34'),
      attribute('versionCode', '6'),
      attribute('versionName', '1.4.0'),
    ]);
    writeFileSync(
      aabPath(),
      zip([
        { name: 'BUNDLE-METADATA/x.properties', data: Buffer.from('noise') },
        { name: 'base/manifest/AndroidManifest.xml', data: manifest },
      ])
    );

    expect(readAabVersion(aabPath())).toEqual({ versionName: '1.4.0', versionCode: '6' });
  });

  it('throws rather than guessing when the manifest carries no versionName', () => {
    const manifest = Buffer.concat([Buffer.from('android'), attribute('versionCode', '6')]);
    writeFileSync(aabPath(), zip([{ name: 'base/manifest/AndroidManifest.xml', data: manifest }]));

    expect(() => readAabVersion(aabPath())).toThrow(/no versionName/);
  });
});

describe('readZipEntry', () => {
  it('reads both deflated and stored entries, and matches by regex', () => {
    const path = join(dir, 'mixed.zip');
    writeFileSync(
      path,
      zip([
        { name: 'a/deflated.txt', data: Buffer.from('x'.repeat(500)) },
        { name: 'Payload/App.app/Info.plist', data: Buffer.from('stored'), store: true },
      ])
    );

    expect(readZipEntry(path, 'a/deflated.txt').toString()).toBe('x'.repeat(500));
    expect(readZipEntry(path, /^Payload\/[^/]+\.app\/Info\.plist$/).toString()).toBe('stored');
    expect(listZipEntries(path)).toEqual(['a/deflated.txt', 'Payload/App.app/Info.plist']);
  });

  it('fails loudly on a missing entry instead of returning empty', () => {
    const path = join(dir, 'empty.zip');
    writeFileSync(path, zip([{ name: 'other.txt', data: Buffer.from('hi') }]));

    expect(() => readZipEntry(path, 'base/manifest/AndroidManifest.xml')).toThrow(/no entry/);
  });
});

describe('readManifestAttribute', () => {
  it('decodes a multi-byte varint length', () => {
    const long = 'a'.repeat(300);
    const manifest = attribute('versionName', long);

    expect(readManifestAttribute(manifest, 'versionName')).toBe(long);
  });

  it('returns null for an attribute that is absent', () => {
    expect(readManifestAttribute(attribute('versionCode', '6'), 'versionName')).toBeNull();
  });
});
