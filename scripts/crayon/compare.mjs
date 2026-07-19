// Build one side-by-side deliverable: the real-crayon REFERENCES (top row) above
// the digital crayon RENDERS (bottom row), for single / double (buildup) /
// scribble. Uses a headless browser page purely as a compositor (no server).
//
//   node scripts/crayon/compare.mjs [render-dir]   (defaults to newest -crayon-)

import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, chromiumExecutablePath } from '../lib/utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const refDir = join(HERE, 'references');

function newestRenderDir() {
  const base = join(ROOT, 'perf-profiles');
  const dirs = readdirSync(base)
    .filter((d) => d.includes('-crayon-'))
    .sort();
  return join(base, dirs[dirs.length - 1]);
}
const renderDir = process.argv[2] || newestRenderDir();
const dataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;

const cols = [
  { key: 'single', label: 'single pass' },
  { key: 'double', label: 'two passes (buildup)' },
  { key: 'scribble', label: 'scribble fill' },
];

const inputs = cols.map((c) => ({
  ...c,
  ref: existsSync(join(refDir, `${c.key}.png`)) ? dataUrl(join(refDir, `${c.key}.png`)) : null,
  render: existsSync(join(renderDir, `${c.key}.png`))
    ? dataUrl(join(renderDir, `${c.key}.png`))
    : null,
}));

const outPath = join(renderDir, 'compare-vs-reference.png');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const page = await browser.newPage();
    const url = await page.evaluate(compose, { inputs });
    writeFileSync(outPath, Buffer.from(url.split(',')[1], 'base64'));
  } finally {
    await browser.close();
  }
  console.log(outPath);
}

async function compose({ inputs }) {
  const CW = 360;
  const CH = 300;
  const pad = 16;
  const rowLabel = 26;
  const canvas = document.createElement('canvas');
  canvas.width = pad + inputs.length * (CW + pad);
  canvas.height = rowLabel + 2 * (CH + rowLabel) + pad;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#222';
  g.font = 'bold 16px sans-serif';

  const load = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  const drawRow = async (y, title, pick) => {
    g.fillStyle = '#222';
    g.font = 'bold 16px sans-serif';
    g.fillText(title, pad, y + 18);
    for (let i = 0; i < inputs.length; i++) {
      const img = await load(pick(inputs[i]));
      const x = pad + i * (CW + pad);
      if (img) g.drawImage(img, x, y + rowLabel, CW, CH);
      g.fillStyle = '#666';
      g.font = '13px sans-serif';
      g.fillText(inputs[i].label, x + 2, y + rowLabel + CH + 16);
    }
  };

  await drawRow(pad, 'Real crayon (reference)', (c) => c.ref);
  await drawRow(pad + CH + rowLabel + 8, 'Splotch crayon (render)', (c) => c.render);
  return canvas.toDataURL('image/png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
