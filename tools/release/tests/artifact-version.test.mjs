import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readAabVersion, readManifestAttribute } from '../lib/artifact-version.mjs';
import { zip } from './fixtures/zip-writer.mjs';

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
