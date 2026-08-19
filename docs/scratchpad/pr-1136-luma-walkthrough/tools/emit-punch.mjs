import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { punchNightCandidate } from './tools/asset-gen/lib/night-halo.mjs';
import { prepareNightAnalysis } from './tools/asset-gen/lib/night-analysis.mjs';
import { resolveNightLineArt } from './tools/asset-gen/lib/asset-paths.mjs';
const COLORING = 'web/static/coloring',
  FILLSRC = 'tools/asset-gen/fill-src';
const outDir = process.argv[2];
await mkdir(outDir, { recursive: true });
const PAGES = [
  'creatures/dragon-wide',
  'dinosaur/trex-wide',
  'farm/cow-wide',
  'nature/ladybug-wide',
  'objects/apple-wide',
  'space/ship-wide',
  'vehicles/train-wide',
  'shapes/star-wide',
  'creatures/unicorn-tall',
  'farm/duck-tall',
  'nature/bee-tall',
  'objects/balloon-tall',
];
for (const page of PAGES) {
  const penPath = join(COLORING, `${page}.outline.webp`);
  const pen = await readFile(penPath);
  const { source } = await resolveNightLineArt(penPath, pen);
  const analysis = await prepareNightAnalysis(
    await readFile(join(FILLSRC, `${page}.night.raw.webp`)),
    source ?? pen
  );
  await writeFile(
    join(outDir, page.replace('/', '__') + '.webp'),
    await punchNightCandidate(analysis, source ?? pen)
  );
}
console.log('emitted', PAGES.length);
