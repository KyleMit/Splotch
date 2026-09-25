import { describe, expect, it } from 'vitest';
import {
  FAKE_ANDROID_SERIAL,
  FAKE_IOS_UDID,
  maskIdentifier,
  scanForDeviceIdentifiers,
} from '../lib/device-identifiers.mjs';
import {
  REDACTED_LAN_HOST,
  REDACTED_MDNS_HOST,
  redactHostAddresses,
  scanForHostAddresses,
} from '../lib/host-addresses.mjs';
import { checkTrackedTree } from '../check-device-identifiers.mjs';

// Built by concatenation so this tracked file never contains a non-exempt
// identifier-shaped literal for the repo-wide scan below to flag.
const SYNTHETIC_UDID = ['00008110', 'AAAABBBBCCCC0000'].join('-');
const SYNTHETIC_SERIAL = ['R5C', 'AAAA0000'].join('');

describe('scanForDeviceIdentifiers', () => {
  it('detects an Apple hardware UDID shape', () => {
    const findings = scanForDeviceIdentifiers(`"udid": "${SYNTHETIC_UDID}"`);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('apple-hardware-udid');
  });

  it('detects a Samsung serial shape', () => {
    const findings = scanForDeviceIdentifiers(`device ${SYNTHETIC_SERIAL} ready`);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('samsung-serial');
  });

  it('detects an identifier inside a short path or URL token', () => {
    expect(
      scanForDeviceIdentifiers(`http://localhost:8100/session/${SYNTHETIC_UDID}/status`)
    ).toHaveLength(1);
  });

  it('exempts the designated fake identifiers', () => {
    expect(scanForDeviceIdentifiers(`${FAKE_IOS_UDID} and ${FAKE_ANDROID_SERIAL}`)).toHaveLength(0);
  });

  it('accepts model names, OS versions, and commit SHAs', () => {
    const text = [
      'Samsung SM-G990U1 on Android 16, iPad Pro 12.9-inch 5th gen on iPadOS 26.5',
      'measured at 9af487b3745c0c1237644c92d5a243b1825911d7 (matrix commit)',
      'kept file actions--8ec8a1aa.json for landscape-dark',
    ].join('\n');
    expect(scanForDeviceIdentifiers(text)).toHaveLength(0);
  });

  it('ignores identifier shapes embedded in long base64 runs', () => {
    const blob = `data:image/webp;base64,${'A'.repeat(60)}${SYNTHETIC_SERIAL}${'B'.repeat(60)}`;
    expect(scanForDeviceIdentifiers(blob)).toHaveLength(0);
  });

  it('reports 1-indexed lines and masked values', () => {
    const findings = scanForDeviceIdentifiers(`first line\nserial ${SYNTHETIC_SERIAL}`);
    expect(findings[0].line).toBe(2);
    expect(findings[0].masked).toBe(maskIdentifier(SYNTHETIC_SERIAL));
    expect(findings[0].masked).not.toContain(SYNTHETIC_SERIAL.slice(4, -2));
  });
});

describe('redactHostAddresses', () => {
  it('replaces the capture Mac and its private LAN address, keeping the probe nonce', () => {
    const serialized = JSON.stringify({
      appUrl: 'https://Some-Mac.local:54790/',
      report: { meta: { url: 'http://192.168.40.54:4192/?probe=run-1' } },
      other: 'http://10.0.0.7:4173/ and 172.20.1.2 but not 172.32.0.1 or 8.8.8.8',
    });
    const redacted = JSON.parse(redactHostAddresses(serialized));
    expect(redacted.appUrl).toBe('https://rig-mac.local:54790/');
    expect(new URL(redacted.report.meta.url).searchParams.get('probe')).toBe('run-1');
    expect(redacted.report.meta.url).toBe('http://lan-host:4192/?probe=run-1');
    expect(redacted.other).toBe('http://lan-host:4173/ and lan-host but not 172.32.0.1 or 8.8.8.8');
  });
});

describe('scanForHostAddresses', () => {
  it('detects a private IPv4 host and an mDNS name in a capture URL', () => {
    const findings = scanForHostAddresses(
      JSON.stringify({
        appUrl: 'http://192.168.40.77:4193/',
        report: { meta: { url: 'https://Some-Mac.local:54790/?probe=run-1-2' } },
      })
    );
    expect(findings.map((finding) => finding.kind)).toEqual(['private-ipv4', 'mdns-host']);
  });

  it('accepts the redaction placeholders, public addresses, and loopback', () => {
    const text = [
      `http://${REDACTED_LAN_HOST}:4193/?probe=run-1-2`,
      `https://${REDACTED_MDNS_HOST}:54790/`,
      'http://127.0.0.1:4173/ and http://localhost:4173/ and 8.8.8.8 and 172.32.0.1',
      'window.localStorage and capacitor://localhost',
    ].join('\n');
    expect(scanForHostAddresses(text)).toEqual([]);
  });

  it('finds nothing in text the redactor has already passed over', () => {
    const text = 'http://10.0.0.7:4173/ http://192.168.1.2/ 172.20.1.2 Kyles-Mac.local';
    expect(scanForHostAddresses(text)).toHaveLength(4);
    expect(scanForHostAddresses(redactHostAddresses(text))).toEqual([]);
  });
});

describe('tracked tree', () => {
  // Reads every tracked text file (~3 s locally, slower on CI runners).
  it('contains no physical-device identifier or evidence host address', { timeout: 60_000 }, () => {
    expect(checkTrackedTree()).toEqual([]);
  });
});
