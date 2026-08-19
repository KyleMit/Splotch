// Runs the public asset-gen scorers over every coloring page and prints a
// deterministic digest. Same file runs in the base tree and the PR tree.
import { createHash } from 'node:crypto';
import { readFile, writeFile, glob } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { prepareOutlineAnalysis } from './tools/asset-gen/lib/outline-analysis.mjs';
import { scoreEyeFill } from './tools/asset-gen/lib/eye-fill.mjs';
import { scoreNightness, scoreDrift } from './tools/asset-gen/lib/night-scores.mjs';
import { scoreNightHalo, punchNightCandidate } from './tools/asset-gen/lib/night-halo.mjs';
import { prepareNightAnalysis } from './tools/asset-gen/lib/night-analysis.mjs';
import { resolveNightLineArt } from './tools/asset-gen/lib/asset-paths.mjs';

const COLORING = 'web/static/coloring';
const FILLSRC = 'tools/asset-gen/fill-src';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

const pages = [];
for await (const f of glob(`${FILLSRC}/*/*.light.raw.webp`))
  pages.push(f.replace(`${FILLSRC}/`, '').replace('.light.raw.webp', ''));
pages.sort();

const out = {};
for (const page of pages) {
  const penPath = join(COLORING, `${page}.outline.webp`);
  const pen = await readFile(penPath);
  const lightRaw = await readFile(join(FILLSRC, `${page}.light.raw.webp`));
  const nightRaw = await readFile(join(FILLSRC, `${page}.night.raw.webp`));
  const shippedNight = await readFile(join(COLORING, `${page}.night.webp`));
  const { source } = await resolveNightLineArt(penPath, pen);
  const lineArt = source ?? pen;

  const a = await prepareOutlineAnalysis(pen);
  const inkHash = sha(Buffer.from(a.ink));
  const lumaHash = sha(Buffer.from(new Uint8Array(a.luma.buffer ?? a.luma)));

  const eyesLight = await scoreEyeFill(lightRaw, pen);
  const eyesNight = await scoreEyeFill(nightRaw, pen);

  const analysis = await prepareNightAnalysis(nightRaw, lineArt);
  const nightness = await scoreNightness(analysis);
  const drift = await scoreDrift(analysis);
  const halo = await scoreNightHalo(analysis, shippedNight);
  const punched = await punchNightCandidate(analysis, lineArt);

  out[page] = {
    inkHash,
    lumaHash,
    eyesLight: eyesLight.cores.map((c) => [
      c.x,
      c.y,
      c.coreLuma,
      c.bandDark,
      c.bandLight,
      c.contrast,
      c.lively,
      c.annulusInkFrac,
    ]),
    eyesNight: eyesNight.cores.map((c) => [
      c.x,
      c.y,
      c.coreLuma,
      c.bandDark,
      c.bandLight,
      c.contrast,
      c.lively,
      c.annulusInkFrac,
    ]),
    nightness,
    drift,
    halo: {
      haloScore: halo.haloScore,
      rawScore: halo.rawScore,
      haloPx12: halo.haloPx12,
      rimPx12: halo.rimPx12,
      bandStats: halo.bandStats,
      hotspots: halo.hotspots,
    },
    punchHash: sha(punched),
  };
  process.stderr.write('.');
}
const json = JSON.stringify(out, null, 1);
await writeFile(process.argv[2], json);
console.log(`\n${pages.length} pages · digest ${sha(json)}`);
