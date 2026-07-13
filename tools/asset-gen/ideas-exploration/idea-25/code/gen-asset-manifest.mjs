// Byte-stability manifest for the committed art: one sha256 line per asset so
// any binary change shows up as a reviewable one-line text diff. The standing
// invariant it guards: a night-only pass (night fills, chalk outlines) must
// leave every light-side byte untouched (*.light.webp, *.outline.webp,
// *.thumb.webp, *.light.raw.webp, style covers) — previously discipline, not a
// check. The hashes also make score-invisible asset swaps visible (two fills
// can score identically; their bytes can't collide).
//
// Covers the shipped art (web/static/coloring/**/*.webp, web/static/styles/*.webp)
// AND the committed source-of-truth raws (tools/asset-gen/fill-src/**/*.webp).
// Offline + deterministic: pure hashing, no key, no network.
//
//   npm run gen:assets:manifest       rewrite tools/asset-gen/asset-manifest.sha256
//   npm run check:assets:manifest     fail if any asset drifted from the manifest (CI)
//
// Format is `sha256sum`-compatible (`<hash>  <repo-relative path>`, sorted, LF)
// so `sha256sum -c` can verify it on unix, but the cross-platform verifier is
// this script's --check mode (ADR-0017).
import { glob, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ASSET_GEN_DIR, COLORING_DIR, STYLES_DIR, FILL_SRC_DIR, fail } from './lib/paths.mjs';

export const MANIFEST_PATH = join(ASSET_GEN_DIR, 'asset-manifest.sha256');

const TREES = [
  { root: COLORING_DIR, prefix: 'web/static/coloring' },
  { root: STYLES_DIR, prefix: 'web/static/styles' },
  { root: FILL_SRC_DIR, prefix: 'tools/asset-gen/fill-src' },
];

async function currentEntries() {
  const entries = [];
  for (const { root, prefix } of TREES) {
    for await (const rel of glob('**/*.webp', { cwd: root })) {
      const path = `${prefix}/${rel.replaceAll('\\', '/')}`;
      const hash = createHash('sha256')
        .update(await readFile(join(root, rel)))
        .digest('hex');
      entries.push({ path, hash });
    }
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : 1));
}

function render(entries) {
  return entries.map(({ path, hash }) => `${hash}  ${path}`).join('\n') + '\n';
}

const checkMode = process.argv.includes('--check');
const entries = await currentEntries();

if (!checkMode) {
  await writeFile(MANIFEST_PATH, render(entries));
  console.log(
    `[asset-manifest] wrote ${entries.length} asset hash(es) to tools/asset-gen/asset-manifest.sha256`
  );
  process.exit(0);
}

const committed = await readFile(MANIFEST_PATH, 'utf8').catch(() =>
  fail('[asset-manifest] no manifest found — run `npm run gen:assets:manifest` and commit it.')
);
const want = new Map(
  committed
    .split('\n')
    .filter(Boolean)
    .map((line) => [line.slice(66), line.slice(0, 64)])
);
const have = new Map(entries.map(({ path, hash }) => [path, hash]));

const problems = [];
for (const [path, hash] of have) {
  if (!want.has(path)) problems.push(`ADDED (not in manifest): ${path}`);
  else if (want.get(path) !== hash) problems.push(`CHANGED (hash mismatch): ${path}`);
}
for (const path of want.keys())
  if (!have.has(path)) problems.push(`REMOVED (still in manifest): ${path}`);

if (problems.length) {
  for (const p of problems) console.error(`[asset-manifest] ${p}`);
  fail(
    `[asset-manifest] ${problems.length} asset(s) drifted from the manifest. If the change is ` +
      'intentional, run `npm run gen:assets:manifest` and commit it — the diff shows exactly which ' +
      'assets changed (a night-only pass must not touch any *.light/*.outline/*.thumb line).'
  );
}
console.log(`[asset-manifest] ${have.size} asset(s) match the manifest.`);
