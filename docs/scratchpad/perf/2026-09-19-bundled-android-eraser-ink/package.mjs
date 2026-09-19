// Builds this package from the session's local capture directory
// (perf-profiles/bundled/units-2026-09-19/, gitignored). Artifacts are gzipped
// byte-for-byte; logs have the checkout's absolute path replaced with <checkout>
// (the device serial was already replaced with <serial> at capture time).
//   node docs/scratchpad/perf/2026-09-19-bundled-android-eraser-ink/package.mjs
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
  ['repro/b-repro-portrait-eraser.json', 'runs/b0-repro-main-portrait-eraser.json.gz', 'gzip'],
  ['unit-b/b1-portrait-eraser-2pass.json', 'runs/b1-portrait-eraser-2pass.json.gz', 'gzip'],
  ['unit-b/b2-portrait-eraser-full-cell.json', 'runs/b2-portrait-eraser-full-cell.json.gz', 'gzip'],
  ['unit-b/b3-landscape-eraser-2pass.json', 'runs/b3-landscape-eraser-2pass.json.gz', 'gzip'],
  ['unit-b/b4-portrait-pen.json', 'runs/b4-portrait-pen.json.gz', 'gzip'],
  ['unit-b/b5-final-portrait-eraser-2pass.json', 'runs/b5-final-portrait-eraser-2pass.json.gz', 'gzip'],
  ['unit-b/b5-final-portrait-eraser-2pass.log', 'controls/b5-final-portrait-eraser-2pass.log.txt', 'sanitize'],
  ['unit-b/b1-attempt1-required-16-strokes.log', 'controls/b1-attempt1-required-16-strokes.log.txt', 'sanitize'],
  ['unit-b/b1-portrait-eraser-2pass.log', 'controls/b1-portrait-eraser-2pass.log.txt', 'sanitize'],
  ['unit-b/b2-portrait-eraser-full-cell.log', 'controls/b2-portrait-eraser-full-cell.log.txt', 'sanitize'],
  ['unit-b/b3-landscape-eraser-2pass.log', 'controls/b3-landscape-eraser-2pass.log.txt', 'sanitize'],
  ['unit-b/b4-portrait-pen.log', 'controls/b4-portrait-pen.log.txt', 'sanitize'],
  ['unit-b/nb1-blank-preparation.log', 'controls/nb1-blank-preparation.log.txt', 'sanitize'],
  ['unit-b/nb2-failed-refill.log', 'controls/nb2-failed-refill.log.txt', 'sanitize'],
  ['unit-b/nb3-stroke-removes-no-ink.log', 'controls/nb3-stroke-removes-no-ink.log.txt', 'sanitize'],
  ['unit-b/nb1-blank-preparation.diagnostic-only.diff', 'diag/nb1-blank-preparation.diagnostic-only.diff', 'copy'],
  ['unit-b/nb2-failed-refill.diagnostic-only.diff', 'diag/nb2-failed-refill.diagnostic-only.diff', 'copy'],
  ['unit-b/nb3-stroke-removes-no-ink.diagnostic-only.diff', 'diag/nb3-stroke-removes-no-ink.diagnostic-only.diff', 'copy'],
  ['diag/read-ink.mjs', 'diag/read-ink.mjs', 'copy'],
  ['diag/swipe-delivery.mjs', 'diag/swipe-delivery.mjs', 'copy'],
  ['diag/swipe-delivery-1.log', 'diag/swipe-delivery-1.log.txt', 'sanitize'],
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
