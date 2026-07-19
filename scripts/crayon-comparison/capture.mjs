import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { freePort, spawnViteServerAt } from './server.mjs';
import { SCENES, SCENE_VERSION } from './scenes.mjs';

const PAPER = '#f7f4ec';
const WIDTH = 44;
const VIEWPORT = { width: 1024, height: 559 };

function arg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const worktree = resolve(arg('worktree', '.'));
const output = resolve(arg('output', join(worktree, 'screenshots', 'crayon-comparison')));
const port = Number(arg('port', '5199'));
const activationArg = arg('activation', 'auto');

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`server did not become ready at ${url}`);
}

function activationCandidates(keys) {
  const available = new Set(keys);
  const candidates = [
    ['setCrayonMode', true],
    ['setCrayonActive', true],
    ['setCrayonVariant', 'waxy'],
    ['setCrayonVariant', 'wax'],
    ['setCrayonRenderVariant', 'waxy'],
    ['setCrayonRenderVariant', 'wax'],
    ['setCrayonRenderParams', 'waxy'],
    ['setBrushVariant', 'crayon'],
    ['setBrush', 'crayon'],
  ];
  return candidates.filter(([name]) => available.has(name));
}

async function activate(page) {
  const keys = await page.evaluate(async () =>
    Object.keys(await import('/src/lib/drawing/engine.ts'))
  );
  if (activationArg === 'default') return { strategy: 'default', keys };
  const requested =
    activationArg === 'auto' ? activationCandidates(keys) : [JSON.parse(activationArg)];
  const errors = [];
  for (const [name, value] of requested) {
    try {
      await page.evaluate(
        async ({ setter, setterValue }) =>
          (await import('/src/lib/drawing/engine.ts'))[setter](setterValue),
        { setter: name, setterValue: value }
      );
      return { strategy: 'setter', setter: name, value, keys };
    } catch (error) {
      errors.push(`${name}(${JSON.stringify(value)}): ${error.message}`);
    }
  }
  if (activationArg === 'auto') return { strategy: 'default-unverified', keys, errors };
  throw new Error(`activation failed: ${errors.join('; ')}`);
}

async function dispatchStroke(page, stroke, pointerId) {
  await page.evaluate(
    async ({ color, points, pointer }) => {
      const engine = await import('/src/lib/drawing/engine.ts');
      engine.setColor(color);
      const canvas = document.querySelector('#drawingCanvas');
      const rect = canvas.getBoundingClientRect();
      const send = (type, point) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: pointer,
            pointerType: 'pen',
            isPrimary: true,
            clientX: rect.left + point.x,
            clientY: rect.top + point.y,
            pressure: 0.65,
            buttons: type === 'pointerup' ? 0 : 1,
            bubbles: true,
            cancelable: true,
          })
        );
      send('pointerdown', points[0]);
      for (const point of points.slice(1)) send('pointermove', point);
      send('pointerup', points.at(-1));
    },
    { color: stroke.color, points: stroke.points, pointer: pointerId }
  );
}

async function captureScene(browser, baseUrl, scene) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: 'commit' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#drawingCanvas');
    return canvas && canvas.width > 300;
  });
  await page.addStyleTag({
    content: `html,body{background:${PAPER}!important;margin:0!important;overflow:hidden!important} body *{visibility:hidden!important} #drawingCanvas{visibility:visible!important;position:fixed!important;inset:0!important;width:${VIEWPORT.width}px!important;height:${VIEWPORT.height}px!important;z-index:99999!important;background:${PAPER}!important}`,
  });
  await page.evaluate(
    async ({ strokeWidth }) => {
      const engine = await import('/src/lib/drawing/engine.ts');
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolveWait) => setTimeout(resolveWait, 350));
      engine.clearCanvas();
      engine.setStrokeWidth(strokeWidth);
    },
    { strokeWidth: WIDTH }
  );
  const activation = await activate(page);
  let pointerId = 10;
  for (const stroke of scene.strokes()) await dispatchStroke(page, stroke, pointerId++);
  await page.waitForTimeout(100);
  const png = join(output, `${scene.id}.png`);
  const webp = join(output, `${scene.id}.webp`);
  await page.locator('#drawingCanvas').screenshot({ path: png });
  await sharp(png).webp({ quality: 92 }).toFile(webp);
  await rm(png);
  const bytes = await readFile(webp);
  const metadata = await page.evaluate(async () => {
    const engine = await import('/src/lib/drawing/engine.ts');
    const canvas = document.querySelector('#drawingCanvas');
    return {
      canvas: { width: canvas.width, height: canvas.height },
      undo: engine.getUndoDebug?.() ?? null,
    };
  });
  await page.close();
  return {
    file: `${scene.id}.webp`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    activation,
    ...metadata,
  };
}

await mkdir(output, { recursive: true });
freePort(port);
const server = spawnViteServerAt(worktree, port, {
  PUBLIC_ENABLE_DEV_HARNESS: 'true',
  PUBLIC_E2E_TEST: 'true',
});
const baseUrl = `http://127.0.0.1:${port}`;
const manifest = {
  schemaVersion: 1,
  sceneSpec: SCENE_VERSION,
  worktree,
  viewport: VIEWPORT,
  paper: PAPER,
  strokeWidth: WIDTH,
  results: [],
};
let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch();
  for (const scene of SCENES)
    manifest.results.push({ scene: scene.id, ...(await captureScene(browser, baseUrl, scene)) });
  manifest.status = 'captured';
} catch (error) {
  manifest.status = 'failed';
  manifest.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.stop();
  await writeFile(join(output, 'capture.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
