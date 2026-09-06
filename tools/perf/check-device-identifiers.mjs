// Rejects physical-device identifiers (Apple hardware UDIDs, rig Android
// serials) anywhere in the tracked tree — evidence, docs, scripts, tests.
//
//   node tools/perf/check-device-identifiers.mjs
//
// Issue #1645: the keeper redacts identifiers at promotion, but older tracked
// files carried them and anything copied forward from one reintroduces them.
// Output masks matched values; the full value stays on the local disk only.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, isMain } from '../lib/proc.mjs';
import { scanForDeviceIdentifiers } from './lib/device-identifiers.mjs';

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
    for (const finding of scanForDeviceIdentifiers(buffer.toString('utf8'))) {
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
      `[check-device-identifiers] ${failures.length} physical-device identifier(s) in tracked files — ` +
        'redact them (promoted evidence uses [redacted]; tests use the FAKE_* constants from tools/perf/lib/device-identifiers.mjs)'
    );
  }
  console.log('[check-device-identifiers] tracked tree is clean');
}
