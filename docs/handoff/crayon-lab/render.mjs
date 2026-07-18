// Render crayon variants through the real engine into buildup-focused test
// scenes, so the Gemini judge (judge.mjs) can score them against real-crayon
// references. Scenes deliberately exercise the two things under review:
// grain containment (single strokes) and coverage buildup (same-colour overlap).
//
//   node crayon-lab/render.mjs --variants=12          (rebuilds)
//   node crayon-lab/render.mjs --variants=11,12 --no-build
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../scripts/lib/utils.mjs';
import { buildAndPreview } from '../scripts/perf/preview.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const args = process.argv.slice(2);
const flag = (n, d) => {
  const h = args.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : d;
};
const variants = flag('variants', '12')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter(Number.isFinite);
const build = !args.includes('--no-build');
const port = Number(flag('port', '4173'));

// Scenes in a 0..1 box. Each scene is {name, strokes:[{color,width,pts,repeat?}]}.
function scenes() {
  const wig = (y, amp = 0.02, n = 60, x0 = 0.1, x1 = 0.9) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: x0 + t * (x1 - x0), y: y + Math.sin(t * 10) * amp });
    }
    return pts;
  };
  return [
    {
      name: 'single',
      strokes: [{ color: '#2f6ad0', width: 22, pts: wig(0.5, 0.06, 60) }],
    },
    {
      // Same stroke laid down twice — should fill toward solid, not shift hue.
      name: 'doubled',
      strokes: [{ color: '#2f6ad0', width: 22, pts: wig(0.5, 0.06, 60), repeat: 2 }],
    },
    {
      // Two crossing strokes, same colour — the crossing must read DENSER.
      name: 'cross',
      strokes: [
        {
          color: '#2f6ad0',
          width: 26,
          pts: [
            { x: 0.15, y: 0.2 },
            { x: 0.85, y: 0.8 },
          ],
        },
        {
          color: '#2f6ad0',
          width: 26,
          pts: [
            { x: 0.85, y: 0.2 },
            { x: 0.15, y: 0.8 },
          ],
        },
      ],
    },
    {
      // Back-and-forth scribble fill: overlapping passes fill the paper tooth.
      name: 'scribble',
      strokes: (() => {
        const pts = [];
        const rows = 14;
        for (let i = 0; i <= rows; i++) {
          const left = i % 2 === 0;
          const y = 0.3 + (i / rows) * 0.4;
          pts.push({ x: left ? 0.35 : 0.65, y });
          pts.push({ x: left ? 0.65 : 0.35, y });
        }
        return [{ color: '#2f6ad0', width: 26, pts }];
      })(),
    },
  ];
}

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  mkdirSync(OUT, { recursive: true });
  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 760, height: 560 },
      deviceScaleFactor: 2,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__engineReady === true);
    await page.evaluate(() => window.__engine.resizeTo(680, 480));
    const all = scenes();
    for (const v of variants) {
      for (const scene of all) {
        await page.evaluate(
          ({ v, scene }) => {
            const eng = window.__engine;
            const canvas = document.getElementById('engineCanvas');
            const rect = canvas.getBoundingClientRect();
            if (!eng.isCanvasEmpty()) {
              eng.clearCanvas();
              eng.undo();
            }
            eng.setBrush('crayon');
            eng.setBrushVariant('crayon', v);
            const abs = (p) => ({ x: p.x * rect.width, y: p.y * rect.height });
            for (const s of scene.strokes) {
              eng.setColor(s.color);
              eng.setStrokeWidth(s.width);
              const reps = s.repeat ?? 1;
              for (let r = 0; r < reps; r++) eng.strokeSync(s.pts.map(abs), 'pen');
            }
          },
          { v, scene }
        );
        await page
          .locator('#engineCanvas')
          .screenshot({ path: join(OUT, `v${v}-${scene.name}.png`) });
      }
      console.log(`rendered v${v}: ${all.map((s) => s.name).join(', ')}`);
    }
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
