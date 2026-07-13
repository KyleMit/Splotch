// Batch CLI: derive the SHIPPED fills-only images from the committed raw fills by
// punching out their own outline pixels, using the page's line art as the mask.
// The punch itself (why it exists, the mask math, the encode settings) lives in
// lib/punch-fill.mjs, shared with gen-coloring-fills.mjs.
//
// Inputs (committed, never shipped):  tools/asset-gen/fill-src/{book}/{page}-{orient}.{light,night}.raw.webp
// Mask:                               web/static/coloring/{book}/{page}-{orient}.outline.webp (the line art)
// Outputs (committed, shipped):       web/static/coloring/{book}/{page}-{orient}.{light,night}.webp
//
// Offline + deterministic: pure sharp, no network, no GEMINI_API_KEY. Safe to
// re-run anytime; a raw fill with no matching line art fails loudly.
//
//   npm run gen:coloring-punch                     punch every raw fill
//   npm run gen:coloring-punch -- nature farm      only these categories
//   npm run gen:coloring-punch -- nature/ant-wide  one page (both variants)
import { parseArgs } from 'node:util';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { REPO_ROOT, COLORING_DIR, FILL_SRC_DIR, fail } from '../lib/paths.mjs';
import { punchFill } from '../lib/punch-fill.mjs';

// Resolve args to raw fills (default: all). An arg is a category ("nature") or a
// page ("nature/ant-wide" — both its light and night raws).
async function rawsUnder(sub = '') {
  const cwd = sub ? join(FILL_SRC_DIR, sub) : FILL_SRC_DIR;
  if (!existsSync(cwd)) return [];
  const out = [];
  for await (const entry of glob('**/*.raw.webp', { cwd })) out.push(join(cwd, entry));
  return out;
}
async function resolveArg(arg) {
  const asDir = join(FILL_SRC_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return rawsUnder(arg);
  const page = await rawsUnder(dirname(arg));
  const matches = page.filter((p) => {
    const rel = relative(FILL_SRC_DIR, p).replace(/\\/g, '/');
    return rel.startsWith(`${arg}.`);
  });
  if (!matches.length)
    fail(`No raw fills match "${arg}" under ${relative(REPO_ROOT, FILL_SRC_DIR)}/`);
  return matches;
}

const { positionals } = parseArgs({ allowPositionals: true });
const raws = (
  positionals.length ? (await Promise.all(positionals.map(resolveArg))).flat() : await rawsUnder()
).sort();
if (!raws.length) fail(`No raw fills found under ${relative(REPO_ROOT, FILL_SRC_DIR)}/`);

for (const raw of raws) {
  const { rel, punched } = await punchFill(raw);
  console.log(`${rel.padEnd(44)} punched ${(punched * 100).toFixed(1).padStart(4)}% of pixels`);
}
console.log(`\n${raws.length} fill(s) punched -> ${relative(REPO_ROOT, COLORING_DIR)}/`);
