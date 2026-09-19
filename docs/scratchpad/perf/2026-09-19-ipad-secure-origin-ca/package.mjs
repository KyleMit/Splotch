// Builds this package from the session's local capture directory
// (perf-profiles/secure-origin-r2/, gitignored). Text is redacted — Android serial and iPad UDID
// become [redacted], the host's LAN address <lan>, its .local name <rig-mac>, quick-tunnel
// hostnames <tunnel>, local paths <checkout>/<home>, process ids [local] — then JSON is gzipped.
// The identifiers are passed in and never stored.
//   node docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca/package.mjs <serial> <lan-address> <local-host-name>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const SOURCE = join(ROOT, 'perf-profiles', 'secure-origin-r2');
const [serial, lan, hostName] = process.argv.slice(2);
if (!serial || !lan || !hostName) {
  throw new Error('usage: package.mjs <serial> <lan-address> <local-host-name>');
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const redact = (text) =>
  text
    .split(serial)
    .join('[redacted]')
    .split(lan)
    .join('<lan>')
    .replace(new RegExp(hostName, 'gi'), '<rig-mac>')
    .split(ROOT)
    .join('<checkout>')
    .split(homedir())
    .join('<home>')
    .replace(/\b[0-9a-z-]+\.trycloudflare\.com\b/g, '<tunnel>')
    .replace(/\b[0-9A-F]{8}-[0-9A-F]{16}\b/g, '[redacted]')
    .replace(/\bpid \d+/g, 'pid [local]');

const FILES = [
  ['ipad-ca-ai-waiting.json', 'runs/c1-ipad-ca-ai-waiting.json.gz', 'redact+gzip'],
  ['ipad-lan-http-negative.json', 'runs/n1-ipad-lan-http-negative.json.gz', 'redact+gzip'],
  ['ipad-ca-ai-waiting.log', 'controls/c1-ipad-ca-ai-waiting.log.txt', 'redact'],
  ['ipad-lan-http-negative.log', 'controls/n1-ipad-lan-http-negative.log.txt', 'redact'],
  ['route-probes-ca2.jsonl', 'controls/route-probes-ca2.jsonl.txt', 'redact'],
  ['route-probes.jsonl', 'controls/route-probes-first-ca-and-tunnel.jsonl.txt', 'redact'],
  ['mac-trust-checks.txt', 'controls/mac-trust-checks.txt', 'redact'],
  ['front-tls-check-v1.txt', 'controls/front-tls-check.txt', 'redact'],
  ['front-local-check.txt', 'controls/front-local-check.txt', 'redact'],
  ['front-public-check.txt', 'controls/front-public-check-1.txt', 'redact'],
  ['front-public-check-2.txt', 'controls/front-public-check-2.txt', 'redact'],
  ['front-54785-requests.tsv', 'controls/front-ca-requests.tsv.txt', 'redact'],
  ['front-54788-tunnel-requests.tsv', 'controls/front-tunnel-requests.tsv.txt', 'redact'],
  ['preflight.log', 'controls/preflight.log.txt', 'redact'],
  ['preflight-ios-4727.log', 'controls/preflight-ios-fresh-appium.log.txt', 'redact'],
  ['discovery.log.txt', 'controls/discovery.log.txt', 'redact'],
  ['wda-relaunch-loop.log', 'controls/wda-relaunch-loop.log.txt', 'redact'],
  ['perf-build.log', 'controls/perf-build.log.txt', 'redact'],
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
