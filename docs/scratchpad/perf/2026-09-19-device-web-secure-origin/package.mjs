// Builds this package from the session's local capture directory
// (perf-profiles/secure-origin-r1/, gitignored). JSON artifacts and logs are
// redacted — device serial and iPad UDID become [redacted], the host's LAN
// address <lan>, local paths <checkout>/<home>, process ids [local] — then JSON is gzipped. The identifiers are passed in and never stored.
//   node docs/scratchpad/perf/2026-09-19-device-web-secure-origin/package.mjs <serial> <lan-address>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const SOURCE = join(ROOT, 'perf-profiles', 'secure-origin-r1');
const [serial, lan] = process.argv.slice(2);
if (!serial || !lan) throw new Error('usage: package.mjs <serial> <lan-address>');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const redact = (text) =>
  text
    .split(serial)
    .join('[redacted]')
    .split(lan)
    .join('<lan>')
    .split(ROOT)
    .join('<checkout>')
    .split(homedir())
    .join('<home>')
    .replace(/\b[0-9A-F]{8}-[0-9A-F]{16}\b/g, '[redacted]')
    .replace(/\bpid \d+/g, 'pid [local]');

const FILES = [
  ['android-chrome-ai-waiting-main-harness.json', 'runs/a0-android-localhost-main-harness.json.gz', 'redact+gzip'],
  ['android-chrome-ai-waiting-evidence.json', 'runs/a1-android-localhost-evidence.json.gz', 'redact+gzip'],
  ['android-chrome-ai-waiting-lan-negative.json', 'runs/n1-android-lan-negative.json.gz', 'redact+gzip'],
  ['android-chrome-ai-waiting-main-harness.log', 'controls/a0-android-localhost-main-harness.log.txt', 'redact'],
  ['android-chrome-ai-waiting-evidence.log', 'controls/a1-android-localhost-evidence.log.txt', 'redact'],
  ['android-chrome-ai-waiting-lan-negative.log', 'controls/n1-android-lan-negative.log.txt', 'redact'],
  ['preflight.log', 'controls/preflight.log.txt', 'redact'],
];

const manifest = [];
for (const [from, to, transform] of FILES) {
  const original = readFileSync(join(SOURCE, from));
  const redacted = Buffer.from(redact(original.toString('utf8')));
  const packaged = transform === 'redact+gzip' ? gzipSync(redacted, { level: 9 }) : redacted;
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
