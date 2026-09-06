// Physical-device identifier detection for tracked files (issue #1645).
//
// The rig's hardware identifiers (an iPad hardware UDID, Samsung Android
// serials) are host-local operator state: promoted evidence redacts them
// (keep-capture-evidence.mjs), and nothing tracked should reintroduce one.
// This module knows the *shapes* only — it deliberately embeds no real
// identifier value.

// Apple hardware UDIDs are 8 hex chars, a hyphen, then 16 hex chars — the
// shape `idevice_id -l` prints and Appium's `appium:udid` wants (see
// capture-readiness.mjs). CoreDevice UUIDs (8-4-4-4-12) do not match.
const APPLE_HARDWARE_UDID = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}/g;

// Samsung device serials as `adb devices` prints them for this rig's phones:
// literal "R5C" then 8 uppercase alphanumerics. Other vendors' serial shapes
// are too generic to pattern-match without false positives; a newly observed
// rig serial of another shape needs its own pattern here.
const SAMSUNG_SERIAL = /R5C[A-Z0-9]{8}/g;

// Deliberately fake, shape-valid identifiers for tests and fixtures. These are
// the only identifier-shaped values allowed in the tracked tree.
export const FAKE_IOS_UDID = '00008103-DEADBEEFDEADBEEF';
export const FAKE_ANDROID_SERIAL = 'R5CFAKESER1';

// A match embedded in a long unbroken base64-ish run is encoded payload (webp
// data URIs in proof sheets have produced exactly this), not an identifier.
// Real identifiers sit in short tokens: JSON string values, CLI args, prose.
const BASE64_RUN_MIN_LENGTH = 80;
const BASE64_CHARS = /[A-Za-z0-9+/=]/;

function embeddedInBase64Run(text, start, end) {
  let left = start;
  while (left > 0 && BASE64_CHARS.test(text[left - 1])) left -= 1;
  let right = end;
  while (right < text.length && BASE64_CHARS.test(text[right])) right += 1;
  return right - left >= BASE64_RUN_MIN_LENGTH;
}

export function maskIdentifier(value) {
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

const PATTERNS = [
  { kind: 'apple-hardware-udid', pattern: APPLE_HARDWARE_UDID, exempt: FAKE_IOS_UDID },
  { kind: 'samsung-serial', pattern: SAMSUNG_SERIAL, exempt: FAKE_ANDROID_SERIAL },
];

export function scanForDeviceIdentifiers(text) {
  const findings = [];
  for (const { kind, pattern, exempt } of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (value.toUpperCase() === exempt.toUpperCase()) continue;
      if (embeddedInBase64Run(text, match.index, match.index + value.length)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push({ kind, line, masked: maskIdentifier(value) });
    }
  }
  return findings;
}
