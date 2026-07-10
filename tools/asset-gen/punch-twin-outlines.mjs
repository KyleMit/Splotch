// Batch CLI: derive the SHIPPED fills-only twins from the committed raw twins by
// punching out their own outline pixels, using the page's line art as the mask.
// The punch itself (why it exists, the mask math, the encode settings) lives in
// lib/punch-twin.mjs, shared with gen-coloring-fills.mjs.
//
// Inputs (committed, never shipped):  tools/asset-gen/twin-src/{book}/{page}-{orient}.{color,night}.raw.webp
// Mask:                               web/static/coloring/{book}/{page}-{orient}.webp (the line art)
// Outputs (committed, shipped):       web/static/coloring/{book}/{page}-{orient}.{color,night}.webp
//
// Offline + deterministic: pure sharp, no network, no GEMINI_API_KEY. Safe to
// re-run anytime; a raw twin with no matching line art fails loudly.
//
//   npm run gen:coloring-punch                     punch every raw twin
//   npm run gen:coloring-punch -- nature farm      only these categories
//   npm run gen:coloring-punch -- nature/ant-wide  one page (both variants)
import { parseArgs } from 'node:util';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { REPO_ROOT, COLORING_DIR, TWIN_SRC_DIR, fail } from './lib/paths.mjs';
import { punchTwin } from './lib/punch-twin.mjs';

// Resolve args to raw twins (default: all). An arg is a category ("nature") or a
// page ("nature/ant-wide" — both its color and night raws).
async function rawsUnder(sub = '') {
  const cwd = sub ? join(TWIN_SRC_DIR, sub) : TWIN_SRC_DIR;
  if (!existsSync(cwd)) return [];
  const out = [];
  for await (const entry of glob('**/*.raw.webp', { cwd })) out.push(join(cwd, entry));
  return out;
}
async function resolveArg(arg) {
  const asDir = join(TWIN_SRC_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return rawsUnder(arg);
  const page = await rawsUnder(dirname(arg));
  const matches = page.filter((p) => {
    const rel = relative(TWIN_SRC_DIR, p).replace(/\\/g, '/');
    return rel.startsWith(`${arg}.`);
  });
  if (!matches.length)
    fail(`No raw twins match "${arg}" under ${relative(REPO_ROOT, TWIN_SRC_DIR)}/`);
  return matches;
}

const { positionals } = parseArgs({ allowPositionals: true });
const raws = (
  positionals.length ? (await Promise.all(positionals.map(resolveArg))).flat() : await rawsUnder()
).sort();
if (!raws.length) fail(`No raw twins found under ${relative(REPO_ROOT, TWIN_SRC_DIR)}/`);

for (const raw of raws) {
  const { rel, punched } = await punchTwin(raw);
  console.log(`${rel.padEnd(44)} punched ${(punched * 100).toFixed(1).padStart(4)}% of pixels`);
}
console.log(`\n${raws.length} twin(s) punched -> ${relative(REPO_ROOT, COLORING_DIR)}/`);
