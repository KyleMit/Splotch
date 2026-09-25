// Rejects physical-device identifiers (Apple hardware UDIDs, rig Android
// serials) anywhere in the tracked tree — evidence, docs, scripts, tests — and
// capture-host addresses (a private IPv4 or an mDNS .local name) in the tracked
// evidence corpus.
//
//   node tools/perf/check-device-identifiers.mjs
//
// Issue #1645: the keeper redacts identifiers at promotion, but older tracked
// files carried them and anything copied forward from one reintroduces them.
// Issue 2221 applies the same reasoning to the host the rig served pages from.
// The host scan is scoped to the evidence corpus because tests, docs and
// scratchpad notes legitimately name LAN addresses to explain the rig.
// Output masks matched values; the full value stays on the local disk only.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, isMain } from '../lib/proc.mjs';
import { scanForDeviceIdentifiers } from './lib/device-identifiers.mjs';
import { scanForHostAddresses } from './lib/host-addresses.mjs';
import { EVIDENCE_ROOT } from './keep-capture-evidence.mjs';

const BINARY_EXTENSIONS = new Set([
  'png',
  'webp',
  'jpg',
  'jpeg',
  'gif',
  'ico',
  'icns',
  'pdf',
  'zip',
  'jar',
  'keystore',
  'p8',
  'mp4',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'aab',
  'apk',
  'ipa',
]);
const BINARY_SNIFF_BYTES = 8192;

function trackedTextFiles() {
  const listing = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return listing
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => !BINARY_EXTENSIONS.has(file.split('.').pop().toLowerCase()));
}

export function checkTrackedTree() {
  const failures = [];
  for (const file of trackedTextFiles()) {
    const buffer = readFileSync(join(ROOT, file));
    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) continue;
    const text = buffer.toString('utf8');
    for (const finding of scanForDeviceIdentifiers(text)) {
      failures.push({ file, ...finding });
    }
    if (!file.startsWith(`${EVIDENCE_ROOT}/`)) continue;
    for (const finding of scanForHostAddresses(text)) {
      failures.push({ file, ...finding });
    }
  }
  return failures;
}

if (isMain(import.meta.url)) {
  const failures = checkTrackedTree();
  if (failures.length > 0) {
    for (const { file, line, kind, masked } of failures) {
      console.error(`${file}:${line} ${kind} ${masked}`);
    }
    fail(
      `[check-device-identifiers] ${failures.length} physical-device identifier(s) or evidence host address(es) in tracked files — ` +
        'redact them (promoted evidence uses [redacted] for a device and lan-host / rig-mac.local for a host, ' +
        'as perf:evidence:keep writes them; tests use the FAKE_* constants from tools/perf/lib/device-identifiers.mjs)'
    );
  }
  console.log('[check-device-identifiers] tracked tree is clean');
}
