// Audit the committed RAW fills' EYES: did each fill actually paint the eyes,
// or did it leave the outlined eye rings flooded one flat color? Complements
// check-coloring-drift.mjs (registration) — a fill can register perfectly and
// still ship dead eyes (nature/bee-wide's night fill did). Scoring and the
// light-as-reference model live in lib/eye-fill.mjs. Deterministic, no API
// key/network. Exits non-zero if any fill fails, so it doubles as a check.
//
//   npm run gen:coloring-fills:audit:eyes                 whole catalog
//   npm run gen:coloring-fills:audit:eyes -- nature       one category
//   npm run gen:coloring-fills:audit:eyes -- nature/bee-wide
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { COLORING_DIR, FILL_SRC_DIR, fail } from './lib/paths.mjs';
import { scoreEyeFill, judgeLightEyes, judgeNightEyes } from './lib/eye-fill.mjs';

async function pagesUnder(sub = '') {
  const cwd = sub ? join(COLORING_DIR, sub) : COLORING_DIR;
  const out = [];
  for await (const entry of glob('**/*-{tall,wide}.outline.webp', { cwd }))
    out.push(join(cwd, entry));
  return out;
}
async function resolveArg(arg) {
  const asFile = join(COLORING_DIR, `${arg}.outline.webp`);
  if (existsSync(asFile)) return [asFile];
  const asDir = join(COLORING_DIR, arg);
  if (existsSync(asDir) && statSync(asDir).isDirectory()) return pagesUnder(arg);
  fail(`no page or category "${arg}" under ${COLORING_DIR}`);
}

const args = process.argv.slice(2);
const pages = (
  args.length ? (await Promise.all(args.map(resolveArg))).flat() : await pagesUnder()
).sort();

let audited = 0;
let flagged = 0;
console.log(`${'page'.padEnd(28)} ${'cores'.padStart(5)} ${'lively'.padStart(6)}  light  night`);
for (const page of pages) {
  const rel = relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '');
  const lightPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  if (!existsSync(lightPath)) continue;
  const source = await readFile(page);
  const light = await scoreEyeFill(await readFile(lightPath), source);
  const lightVerdict = judgeLightEyes(light);
  const nightPath = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
  const night = existsSync(nightPath)
    ? judgeNightEyes(await scoreEyeFill(await readFile(nightPath), source), light)
    : null;
  audited++;
  const bad = !lightVerdict.passes || (night && !night.passes);
  if (bad) flagged++;
  const lively = light.cores.filter((c) => c.lively).length;
  const nightCol = night ? (night.passes ? 'ok' : `FAIL (${night.failed} eye(s) flat)`) : '-';
  console.log(
    `${rel.padEnd(28)} ${String(light.cores.length).padStart(5)} ${String(lively).padStart(6)}  ${(lightVerdict.passes ? 'ok' : 'FAIL').padEnd(5)}  ${nightCol}`
  );
}

if (!audited) fail('No raw fills found for the given pages.');
console.log(`\n${audited} page(s) audited · ${flagged} flagged.`);
if (flagged) {
  console.log(
    'A flat LIGHT verdict usually means the outline itself needs normalizing (gen:coloring-outlines:audit); a flat NIGHT verdict means regenerating the night fill (gen-coloring-fills-dark).'
  );
  process.exitCode = 1;
}
