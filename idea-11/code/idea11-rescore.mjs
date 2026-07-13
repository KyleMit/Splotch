// TEMP experiment script (idea #11): re-score every SHIPPED chalk against the
// pen reference two ways — as-is (current gate) and with the pen's solid
// interiors whitened out of the reference (proposed fix) — and tabulate.
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { COLORING_DIR } from './lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from './lib/outline-match.mjs';
import { scoreSolidity, whitenSolidRegions } from './lib/solid-regions.mjs';

const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node idea11-rescore.mjs <out.json>');
  process.exit(1);
}

const pages = [];
for await (const entry of glob('**/*-{tall,wide}.outline.webp', { cwd: COLORING_DIR }))
  pages.push(entry.replace(/\\/g, '/'));
pages.sort();

const rows = [];
for (const entry of pages) {
  const rel = entry.replace(/\.outline\.webp$/, '');
  const chalkPath = join(COLORING_DIR, `${rel}.chalk.webp`);
  if (!existsSync(chalkPath)) continue;
  const pen = await readFile(join(COLORING_DIR, entry));
  const chalk = await readFile(chalkPath);
  const solidity = await scoreSolidity(pen);
  const before = await outlineMatch(pen, chalk);
  const whitened = await whitenSolidRegions(pen, solidity);
  const after = await outlineMatch(whitened, chalk);
  const passB = before.keep >= KEEP_THRESHOLD && before.localKeep >= LOCAL_KEEP_THRESHOLD;
  const passA = after.keep >= KEEP_THRESHOLD && after.localKeep >= LOCAL_KEEP_THRESHOLD;
  rows.push({
    page: rel,
    blob: solidity.biggestBlob,
    interiorPx: solidity.interiorPx,
    solidPasses: solidity.passes,
    before: { keep: before.keep, localKeep: before.localKeep, pass: passB },
    after: { keep: after.keep, localKeep: after.localKeep, pass: passA },
  });
  console.log(
    `${rel.padEnd(32)} blob ${String(solidity.biggestBlob).padStart(5)}  ` +
      `before k ${(before.keep * 100).toFixed(1)}% l ${(before.localKeep * 100).toFixed(1)}% ${passB ? 'PASS' : 'FAIL'}  ` +
      `after k ${(after.keep * 100).toFixed(1)}% l ${(after.localKeep * 100).toFixed(1)}% ${passA ? 'PASS' : 'FAIL'}`
  );
}
await writeFile(OUT, JSON.stringify(rows, null, 2));
console.log(`\n${rows.length} pages -> ${relative(process.cwd(), OUT)}`);
