// TEMP (idea #12): generate a DRAFT per-page eye annotation from the light-raw
// reference detection, ready for one-time human blessing. Delete after use.
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { scoreEyeFill, BAND_BLIND_INK_FRAC, CHALK_WHITE_MIN } from './lib/eye-fill.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const STRONG = 180;
const pages = [];
for await (const e of glob('**/*-{tall,wide}.outline.webp', { cwd: COLORING_DIR }))
  pages.push(join(COLORING_DIR, e));
pages.sort();
const out = {
  $schema:
    'eye-annotations.draft — cores detected from the pen outline, measured on the committed light raw (reference) and the simulated night composite. A human flips `eye` where the draft guessed wrong and sets blessed=true; the night eye gate then trusts `eye` instead of re-deriving which cores are eyes.',
  pages: {},
};
for (const page of pages) {
  const rel = relative(COLORING_DIR, page)
    .replace(/\.outline\.webp$/, '')
    .replaceAll('\\', '/');
  const lightPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  if (!existsSync(lightPath)) continue;
  const pen = await readFile(page);
  const light = await scoreEyeFill(await readFile(lightPath), pen);
  if (!light.cores.length) {
    out.pages[rel] = { blessed: false, cores: [] };
    continue;
  }
  const chalkPath = page.replace(/\.outline\.webp$/, '.chalk.webp');
  const nightPath = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
  let night = { cores: [] };
  if (existsSync(nightPath)) {
    const raw = await readFile(nightPath);
    const judged = existsSync(chalkPath)
      ? await compositeNight(raw, await readFile(chalkPath))
      : raw;
    night = await scoreEyeFill(judged, pen);
  }
  out.pages[rel] = {
    blessed: false,
    cores: light.cores.map((L, i) => {
      const N = night.cores[i];
      const isRef = L.lively && Math.max(L.coreLuma, L.bandLight) >= STRONG;
      const bandBlind = L.annulusInkFrac > BAND_BLIND_INK_FRAC;
      const chalkWhiteNear = N ? Math.max(N.coreLuma, N.bandLight) >= CHALK_WHITE_MIN : null;
      return {
        x: L.x,
        y: L.y,
        eye: isRef && !bandBlind && chalkWhiteNear !== false,
        draftReasons: { lightReference: isRef, bandBlind, chalkWhiteNear },
      };
    }),
  };
}
await writeFile(process.argv[2], JSON.stringify(out, null, 1));
const n = Object.values(out.pages);
console.log(
  `${n.length} pages, ${n.reduce((s, p) => s + p.cores.length, 0)} cores, ${n.reduce((s, p) => s + p.cores.filter((c) => c.eye).length, 0)} draft eyes`
);
