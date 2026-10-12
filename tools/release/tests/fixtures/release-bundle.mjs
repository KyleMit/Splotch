import { zip } from './zip-writer.mjs';

export const R8_MAPPING = '# compiler: R8\n# compiler_version: 9.4.1\nexample.Plugin -> a.b:\n';

// The aapt.pb.XmlAttribute shape the manifest reader scans for: name in field
// 2, literal value in field 3. One-byte lengths hold only short values.
function manifestAttribute(name, value) {
  return Buffer.concat([
    Buffer.from([0x12, name.length]),
    Buffer.from(name),
    Buffer.from([0x1a, value.length]),
    Buffer.from(value),
  ]);
}

// An Android release bundle that passes every publish check for 1.6.0 (8).
// Pass null for `versionCode`, `mapping`, or `signatureBlock` to leave it out.
export function releaseBundle({
  versionName = '1.6.0',
  versionCode = '8',
  mapping = R8_MAPPING,
  signatureBlock = 'META-INF/UPLOAD.RSA',
} = {}) {
  const attributes = [manifestAttribute('versionName', versionName)];
  if (versionCode !== null) attributes.push(manifestAttribute('versionCode', versionCode));
  const entries = [{ name: 'base/manifest/AndroidManifest.xml', data: Buffer.concat(attributes) }];
  if (mapping !== null) {
    entries.push({
      name: 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map',
      data: Buffer.from(mapping),
    });
  }
  if (signatureBlock !== null) {
    entries.push({ name: signatureBlock, data: Buffer.from('PKCS #7 signature block') });
  }
  return zip(entries);
}
