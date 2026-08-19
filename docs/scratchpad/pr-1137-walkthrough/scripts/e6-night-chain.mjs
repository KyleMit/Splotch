import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { svgLabel, stack, zoomCrop } from './lib.mjs';

const P = 'creatures/owl-wide';
const chalk = `web/static/coloring/${P}.chalk.webp`;
const nightRaw = `tools/asset-gen/fill-src/${P}.night.raw.webp`;
const shipped = `web/static/coloring/max-1152px/${P}.night.webp`;
const darkOverlay = `web/static/coloring/max-1152px/${P}.dark.overlay.webp`;

// Exactly what gen-night-fills.mjs toDarkInput() does, minus the optional dilate.
const darkInput = await sharp(await sharp(chalk).png().toBuffer())
  .negate({ alpha: false })
  .webp({ quality: 90 })
  .toBuffer();
await writeFile('.viz/out/_darkinput.webp', darkInput);

const W = 460;
const steps = [
  { buf: await sharp(chalk).resize(W).png().toBuffer(), t: '1 · chalk outline, as stored', s: 'ink on white — shipped, q92', c: '#166534' },
  { buf: await sharp(darkInput).resize(W).png().toBuffer(), t: '2 · toDarkInput() negates it', s: 'TRANSIENT — encoded q90, never shipped', c: '#92400e' },
  { buf: await sharp(nightRaw).resize(W).png().toBuffer(), t: '3 · model paints the night fill', s: 'raw fill in fill-src/ — q90', c: '#1d4ed8' },
  { buf: await sharp(shipped).resize(W).png().toBuffer(), t: '4 · punched + shipped', s: '.night.webp the app loads', c: '#111827' },
];
const cells = await Promise.all(steps.map(async (s) =>
  stack([svgLabel(W, 58, [s.t, { t: s.s, size: 14, weight: 400, fg: '#6b7280' }], { size: 18, fg: s.c }), s.buf])
));
const head = svgLabel(W * 4 + 36, 54, ['gen-night-fills.mjs — one WEBP_QUALITY=90 covers BOTH a transient input and a shipped output'], { size: 22, bg: '#f3f4f6' });
await writeFile('.viz/out/e6-night-chain.png', await stack([head, await stack(cells, { gap: 12, dir: 'h' })], { gap: 10, bg: '#e5e7eb' }));
console.log('ok');
