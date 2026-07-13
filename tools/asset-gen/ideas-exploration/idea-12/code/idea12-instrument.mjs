// TEMP (idea #12 experiment): per-core instrumentation of judgeNightEyes.
// Dumps every core's light + night measurements and renders an overlay crop
// per core so false-flags can be visually adjudicated. Delete after use.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { scoreEyeFill, findEyeCores } from './lib/eye-fill.mjs';
import { compositeNight } from './lib/night-composite.mjs';

const OUT = process.env.IDEA12_OUT ?? '/tmp/idea12';
const STRONG_LIGHT_SIDE = 180;

const pagesArg = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

for (const rel of pagesArg) {
  const penPath = join(COLORING_DIR, `${rel}.outline.webp`);
  const lightPath = join(FILL_SRC_DIR, `${rel}.light.raw.webp`);
  const nightPath = join(FILL_SRC_DIR, `${rel}.night.raw.webp`);
  const chalkPath = join(COLORING_DIR, `${rel}.chalk.webp`);
  const pen = await readFile(penPath);
  const light = await scoreEyeFill(await readFile(lightPath), pen);
  const nightRaw = await readFile(nightPath);
  const judged = existsSync(chalkPath)
    ? await compositeNight(nightRaw, await readFile(chalkPath))
    : nightRaw;
  const night = await scoreEyeFill(judged, pen);

  const { cores, w, h } = await findEyeCores(pen);
  console.log(`\n=== ${rel} (${w}x${h}) — ${light.cores.length} measurable cores ===`);
  console.log(
    'idx |   x,y      | core bbox px | LIGHT core/dark/light lively ref | NIGHT core/dark/light lively | verdict'
  );
  const rows = [];
  for (let i = 0; i < light.cores.length; i++) {
    const L = light.cores[i];
    const N = night.cores[i];
    const isRef = L.lively && Math.max(L.coreLuma, L.bandLight) >= STRONG_LIGHT_SIDE;
    const fails = isRef && N && !N.lively;
    rows.push({ i, L, N, isRef, fails });
    console.log(
      `${String(i).padStart(3)} | ${String(L.x).padStart(4)},${String(L.y).padStart(4)} | ` +
        `${String(Math.round(L.coreLuma)).padStart(4)}/${String(Math.round(L.bandDark)).padStart(4)}/${String(Math.round(L.bandLight)).padStart(4)} ` +
        `${L.lively ? 'LIVELY' : 'flat  '} ${isRef ? 'REF' : '   '} | ` +
        (N
          ? `${String(Math.round(N.coreLuma)).padStart(4)}/${String(Math.round(N.bandDark)).padStart(4)}/${String(Math.round(N.bandLight)).padStart(4)} ${N.lively ? 'LIVELY' : 'flat  '}`
          : '  (unmeasured)              ') +
        ` | ${fails ? '** FIRES **' : ''}`
    );
  }

  // Overlay: draw core markers on light raw + night composite, save page-wide + crops of firing cores.
  const mark = (svgW, svgH, items) =>
    Buffer.from(
      `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">` +
        items
          .map(
            ({ x, y, color, label }) =>
              `<circle cx="${x}" cy="${y}" r="14" fill="none" stroke="${color}" stroke-width="3"/>` +
              `<text x="${x + 16}" y="${y + 5}" font-size="18" font-family="sans-serif" fill="${color}">${label}</text>`
          )
          .join('') +
        `</svg>`
    );
  const items = rows.map((r) => ({
    x: r.L.x,
    y: r.L.y,
    color: r.fails ? 'red' : r.isRef ? 'lime' : 'deepskyblue',
    label: String(r.i),
  }));
  const slug = rel.replace('/', '_');
  for (const [name, buf] of [
    ['light', await readFile(lightPath)],
    ['night', judged],
  ]) {
    const img = sharp(buf).removeAlpha().resize(w, h, { fit: 'fill' });
    await img
      .composite([{ input: mark(w, h, items), top: 0, left: 0 }])
      .webp()
      .toFile(join(OUT, `${slug}.${name}.overlay.webp`));
  }
  await writeFile(join(OUT, `${slug}.json`), JSON.stringify(rows, null, 1));
}
