// Render the REAL crayon renderer into fixed scenes, composited on paper, so the
// look can be judged against real-crayon references (area:crayon). Drives the
// /dev/engine harness with strokeSync, sets the crayon variant, and captures each
// scene as a PNG on a warm paper background (paper fill + the app's handmade-paper
// texture at low alpha, matching the on-screen paper).
//
//   node scripts/crayon/render-scenes.mjs                 # default variant, all scenes
//   node scripts/crayon/render-scenes.mjs --no-build --variant=fine --color=%232c6fb0
//
// Writes PNGs + a contact sheet to perf-profiles/<stamp>-crayon-<variant>/.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, chromiumExecutablePath, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from '../perf/preview.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const variant = (args.find((a) => a.startsWith('--variant=')) || '').split('=')[1] || 'waxy';
const colorArg = (args.find((a) => a.startsWith('--color=')) || '').split('=')[1];
const color = colorArg ? decodeURIComponent(colorArg) : '#2f6db3';

const W = 360;
const H = 300;
const DSF = 2;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(ROOT, 'perf-profiles', `${stamp}-crayon-${variant}`);
mkdirSync(outDir, { recursive: true });

// Scenes are built as pointer paths in CSS px within the WxH canvas.
const line = (y, n = 40) =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: 40 + (i / n) * (W - 80),
    y: y + Math.sin((i / n) * Math.PI) * 6,
  }));

function scribble() {
  const pts = [];
  let x = 46;
  const top = 90;
  const bot = 210;
  let down = true;
  for (let col = 0; col < 12; col++) {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push({ x, y: down ? top + t * (bot - top) : bot - t * (bot - top) });
    }
    x += (W - 92) / 12;
    down = !down;
  }
  return pts;
}

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  const { base, stop } = await buildAndPreview(4174, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: DSF,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#engineCanvas');
    await page.waitForFunction(() => window.__engineReady === true);
    await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), { w: W, h: H });
    await sleep(80);

    const scenes = {
      // one pass
      single: { brush: 5, strokes: [line(150)] },
      // two overlapping same-colour passes (buildup)
      double: { brush: 5, strokes: [line(150), line(150)] },
      // three passes, to show it keep building toward solid
      triple: { brush: 5, strokes: [line(150), line(150), line(150)] },
      // a scribble fill
      scribble: { brush: 4, strokes: [scribble()] },
    };

    const captured = {};
    for (const [name, scene] of Object.entries(scenes)) {
      const dataUrl = await page.evaluate(runScene, { name, scene, variant, color, W, H });
      const b64 = dataUrl.split(',')[1];
      writeFileSync(join(outDir, `${name}.png`), Buffer.from(b64, 'base64'));
      captured[name] = dataUrl;
      console.log(`rendered ${name}`);
    }

    // Contact sheet: single | double | triple | scribble in a row on paper.
    const sheet = await page.evaluate(makeContactSheet, { captured, W, H });
    writeFileSync(join(outDir, 'contact.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    await ctx.close();
  } finally {
    await browser.close();
    stop();
  }
  console.log(`\nArtifacts: ${outDir}`);
}

// In-page: set the variant + crayon mode, draw each stroke as its own command
// (so overlapping passes build up), then composite the transparent canvas over a
// paper background and return a data URL.
async function runScene({ name, scene, variant, color, W, H }) {
  const E = window.__engine;
  const cv = document.querySelector('#engineCanvas');
  E.clearCanvas();
  E.setCrayonVariant(variant);
  E.setCrayonMode(true);
  E.setColor(color);
  E.setStrokeWidth({ 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 }[scene.brush] || 22);
  // Pen input bypasses the color-change debounce that a synchronous setColor just
  // armed (a mouse pointerdown in the same tick would be swallowed).
  for (const stroke of scene.strokes) E.strokeSync(stroke, 'pen');

  // Composite over paper (fill + the app's handmade-paper texture at low alpha).
  const out = document.createElement('canvas');
  out.width = cv.width;
  out.height = cv.height;
  const g = out.getContext('2d');
  g.fillStyle = '#f7f2e6';
  g.fillRect(0, 0, out.width, out.height);
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const pat = g.createPattern(img, 'repeat');
      if (pat) {
        g.globalAlpha = 0.5;
        g.fillStyle = pat;
        g.fillRect(0, 0, out.width, out.height);
        g.globalAlpha = 1;
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = '/icons/handmade-paper.webp';
  });
  g.drawImage(cv, 0, 0);
  return out.toDataURL('image/png');
}

function makeContactSheet({ captured, W, H }) {
  const order = ['single', 'double', 'triple', 'scribble'];
  const pad = 12;
  const scale = 1;
  const cw = W * scale;
  const ch = H * scale;
  const out = document.createElement('canvas');
  out.width = pad + order.length * (cw + pad);
  out.height = pad + ch + pad + 24;
  const g = out.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = '#333';
  g.font = '16px sans-serif';
  return new Promise((resolve) => {
    let loaded = 0;
    const imgs = order.map((name) => {
      const img = new Image();
      img.src = captured[name];
      return { name, img };
    });
    const done = () => {
      imgs.forEach(({ name, img }, i) => {
        const x = pad + i * (cw + pad);
        g.drawImage(img, x, pad, cw, ch);
        g.fillText(name, x + 4, pad + ch + 18);
      });
      resolve(out.toDataURL('image/png'));
    };
    imgs.forEach(({ img }) => {
      if (img.complete) {
        if (++loaded === imgs.length) done();
      } else {
        img.onload = () => {
          if (++loaded === imgs.length) done();
        };
        img.onerror = () => {
          if (++loaded === imgs.length) done();
        };
      }
    });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
