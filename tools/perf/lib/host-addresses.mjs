// Capture-host address redaction and detection for tracked evidence (issue 2221).
//
// Where the capture host sat on its LAN — the Mac's mDNS name and its private
// IPv4 — is machine state, not evidence: page URLs, report URLs and a sweep's
// appUrl all carry it. Attribution reads only a URL's path and query (the probe
// nonce), so the host is replaced with a fixed placeholder that still parses as
// a URL host rather than removed. The promoter (keep-capture-evidence.mjs)
// redacts with these patterns and the tracked-tree guard
// (check-device-identifiers.mjs) fails on any match they leave behind.

import { maskIdentifier } from './device-identifiers.mjs';

export const REDACTED_LAN_HOST = 'lan-host';
export const REDACTED_MDNS_HOST = 'rig-mac.local';
// Every label of the name, not just the last one before `.local`, and in any
// case: a suffix match would pass `a.rig-mac.local` as the placeholder.
const MDNS_HOST = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+local\b/gi;
const PRIVATE_IPV4 =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;

export function redactHostAddresses(serialized) {
  return serialized.replace(MDNS_HOST, REDACTED_MDNS_HOST).replace(PRIVATE_IPV4, REDACTED_LAN_HOST);
}

const PATTERNS = [
  { kind: 'private-ipv4', pattern: PRIVATE_IPV4, exempt: null },
  { kind: 'mdns-host', pattern: MDNS_HOST, exempt: REDACTED_MDNS_HOST },
];

export function scanForHostAddresses(text) {
  const findings = [];
  for (const { kind, pattern, exempt } of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (exempt && value.toLowerCase() === exempt) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push({ kind, line, masked: maskIdentifier(value) });
    }
  }
  return findings;
}
