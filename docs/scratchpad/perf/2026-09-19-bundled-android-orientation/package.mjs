// Builds this package from the session's local capture directory
// (perf-profiles/bundled/units-2026-09-19/, gitignored). Artifacts are gzipped
// byte-for-byte; logs have the checkout's absolute path replaced with <checkout>
// (the device serial was already replaced with <serial> at capture time).
//   node docs/scratchpad/perf/2026-09-19-bundled-android-orientation/package.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const SOURCE = join(ROOT, 'perf-profiles', 'bundled', 'units-2026-09-19');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const FILES = [
  ['repro/a-repro-landscape-pen.json', 'runs/a0-repro-main-landscape-pen.json.gz', 'gzip'],
  ['unit-a/a1-portrait-pen.json', 'runs/a1-portrait-pen.json.gz', 'gzip'],
  ['unit-a/a2-landscape-pen.json', 'runs/a2-landscape-pen.json.gz', 'gzip'],
  ['unit-a/a1-portrait-pen.log', 'controls/a1-portrait-pen.log.txt', 'sanitize'],
  ['unit-a/a2-landscape-pen.log', 'controls/a2-landscape-pen.log.txt', 'sanitize'],
  ['unit-a/a2-attempt1-landscape-pen-no-reassert.log', 'controls/a2-attempt1-no-reassert.log.txt', 'sanitize'],
  ['unit-a/n1-forced-mismatch.log', 'controls/n1-forced-mismatch.log.txt', 'sanitize'],
  ['unit-a/n2-failure-after-release.log', 'controls/n2-failure-after-release.log.txt', 'sanitize'],
  ['unit-a/n3-sigint.log', 'controls/n3-sigint.log.txt', 'sanitize'],
  ['unit-a/n3b-sigint-mid-gesture.log', 'controls/n3b-sigint-mid-gesture.log.txt', 'sanitize'],
  ['unit-a/n4-sigint-during-release.log', 'controls/n4-sigint-during-release.log.txt', 'sanitize'],
  ['unit-a/n3b-sigint-mid-gesture-lock-after.json', 'controls/n3b-lock-after.json', 'copy'],
  ['unit-a/n4-sigint-during-release-lock-after.json', 'controls/n4-lock-after.json', 'copy'],
  ['unit-a/a1-lock-after.json', 'controls/a1-lock-after.json', 'copy'],
  ['unit-a/a2-attempt1-lock-after.json', 'controls/a2-attempt1-lock-after.json', 'copy'],
  ['unit-a/a2-lock-after.json', 'controls/a2-lock-after.json', 'copy'],
  ['unit-a/n1-lock-after.json', 'controls/n1-lock-after.json', 'copy'],
  ['unit-a/n2-lock-after.json', 'controls/n2-lock-after.json', 'copy'],
  ['unit-a/n3-lock-after.json', 'controls/n3-lock-after.json', 'copy'],
  ['unit-a/n1-forced-mismatch.diag.patch', 'diag/n1-forced-mismatch.diagnostic-only.diff', 'copy'],
  ['diag/read-lock.mjs', 'diag/read-lock.mjs', 'copy'],
  ['diag/read-ink.mjs', 'diag/read-ink.mjs', 'copy'],
  ['diag/unlock-experiment.mjs', 'diag/unlock-experiment.mjs', 'copy'],
  ['diag/unlock-experiment-same-value.mjs', 'diag/unlock-experiment-same-value.mjs', 'copy'],
  ['diag/unlock-experiment-1.log', 'diag/unlock-experiment-1.log.txt', 'sanitize'],
  ['diag/unlock-experiment-2-same-value.log', 'diag/unlock-experiment-2-same-value.log.txt', 'sanitize'],
];

const manifest = [];
for (const [from, to, transform] of FILES) {
  const original = readFileSync(join(SOURCE, from));
  const packaged =
    transform === 'gzip'
      ? gzipSync(original, { level: 9 })
      : transform === 'sanitize'
        ? Buffer.from(original.toString('utf8').replaceAll(ROOT, '<checkout>'))
        : original;
  mkdirSync(dirname(join(HERE, to)), { recursive: true });
  writeFileSync(join(HERE, to), packaged);
  manifest.push({
    path: to,
    sha256: sha(packaged),
    original: relative(ROOT, join(SOURCE, from)),
    originalSha256: sha(original),
    transform,
  });
}
writeFileSync(join(HERE, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`packaged ${manifest.length} files`);
