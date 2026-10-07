import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest } from '../contract.mjs';
import { verifyPageReport } from '../report-contract.mjs';

function report() {
  const bytes = Buffer.from('<map><string name="owned">value</string></map>');
  const raw = {
    kind: 'buffer',
    bytes: bytes.length,
    base64: bytes.toString('base64'),
    sha256: digest(bytes),
  };
  const file = {
    path: '/owned/shared_prefs/CapacitorStorage.xml',
    present: true,
    status: 'parsed',
    raw,
    rows: {},
  };
  return {
    command: 'disk',
    nonce: 'a'.repeat(32),
    role: 'reader',
    revision: 'b'.repeat(40),
    result: {
      preferences: { primary: structuredClone(file), backup: structuredClone(file) },
      vault: { primary: structuredClone(file), backup: structuredClone(file) },
    },
  };
}
const expected = {
  command: 'disk',
  nonce: 'a'.repeat(32),
  input: { role: 'reader', revision: 'b'.repeat(40), configuration: {} },
  platform: 'android',
};

describe('legacy disk and console source boundaries', () => {
  it('retains complete bytes while refusing a parsed XML failure and restores a qualified transport', () => {
    const positive = report();
    const refused = structuredClone(positive);
    refused.result.preferences.primary.status = 'parse-refused';
    refused.result.preferences.primary.parseError = 'L0_SHARED_PREFS_XML_DUPLICATE_OWNED_KEY';
    expect(() => verifyPageReport(refused, expected)).toThrow(/L0_DISK_PARSE_REFUSED/);
    expect(refused.result.preferences.primary.raw).toEqual(positive.result.preferences.primary.raw);
    expect(refused.result.preferences.backup.raw).toEqual(positive.result.preferences.backup.raw);
    const wrongHash = structuredClone(positive);
    wrongHash.result.preferences.backup.raw.sha256 = '0'.repeat(64);
    expect(() => verifyPageReport(wrongHash, expected)).toThrow(/L0_BUFFER_HASH_CHANGED/);
    expect(() => verifyPageReport(positive, expected)).not.toThrow();
  });

  it('refuses an unavailable XML file capture without labelling it absent', () => {
    const value = report();
    value.result.vault.backup.status = 'capture-failed';
    value.result.vault.backup.readError = 'L0_OWNED_IO_FAILURE';
    expect(() => verifyPageReport(value, expected)).toThrow(/L0_DISK_CAPTURE_FAILED/);
    expect(() => verifyPageReport(report(), expected)).not.toThrow();
  });

  it('pins both actual Swift frame branches to explicit stdout flush and raw-before-command order', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../templates/LegacyContinuityDriver.swift.template'),
      'utf8'
    );
    expect(source).toContain('import Darwin');
    expect(source).toContain('guard fflush(stdout) == 0 else { return false }');
    expect(source).toContain('_ = fflush(stdout)');
    expect(source.indexOf('guard self.writeReport')).toBeLessThan(
      source.indexOf('else { self.executeCommand() }')
    );
  });
});
