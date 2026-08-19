#!/usr/bin/env node
// Capture crayon-brush INPUT drawings for the eval corpus, by replaying the
// authored store-drawing scenes in the live app with the crayon selected and
// screenshotting the canvas.
//
// Every other input in the corpus is drawn by a model or composited by a
// script, which means none of them carry the app's actual crayon texture — the
// grain, the soft edge, the way two passes darken where they cross. A prompt
// that reads that texture as "this is already a painting" or smooths it away
// cannot be caught by an input that never had it. These come off the real
// canvas through the real pointer path, so they are the pixels
// /api/generate-image would actually receive from a crayon session.
//
//   npm run model-eval:gen-crayon                 # every scene, crayon
//   SCENES=house-wide,island-tall npm run model-eval:gen-crayon
//   BRUSH=pen npm run model-eval:gen-crayon       # the same scenes, pen (contrast)
//
// Needs Playwright Chromium and a free port (or one already serving Splotch).
// No API key and no paid call: this is replay and capture only.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT, PAPER } from './lib/model-eval.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { fail, isMain, sleep } from '../lib/proc.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
} from '../app-driver/lib/app-driver.mjs';
import { STORE_DRAWINGS } from '../store-drawings/generated/store-drawings.mjs';

const OUT = join(ROOT, 'tools/model-eval/inputs');
const DRAWING_CANVAS_SELECTOR = '#drawingCanvas';

// Corpus canvas sizes, matching the ones gen-model-fixtures renders at, so a
// crayon input sits beside the rest of the corpus without a second shape.
const CORPUS_DIMS = { tall: [864, 1296], wide: [1296, 864] };

// The scene is fitted to the live canvas, so the viewport shape decides the
// drawing's aspect. These are the two store targets the pointer instructions
// were calibrated against (tools/store-drawings/README.md) — a third, square
// viewport would replay them at a scale their width calibration never saw.
const DEVICES = {
  tall: { width: 432, height: 768, deviceScaleFactor: 2.5 },
  wide: { width: 1280, height: 720, deviceScaleFactor: 1.5 },
};

const SCENES = [
  { name: 'house-wide', aspect: 'wide' },
  { name: 'home-wide', aspect: 'wide' },
  { name: 'dinosaur-wide', aspect: 'wide' },
  { name: 'island-tall', aspect: 'tall' },
  { name: 'balloon-tall', aspect: 'tall' },
  { name: 'house-tall', aspect: 'tall' },
];

// The canvas keeps painting for a beat after the last pointer event, and the
// chrome fades rather than vanishing when its visibility flips.
const CAPTURE_SETTLE_MS = 750;
const CHROME_HIDE_SETTLE_MS = 300;

function selectedScenes() {
  const wanted = (process.env.SCENES || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (!wanted.length) return SCENES;
  const unknown = wanted.filter((name) => !SCENES.some((scene) => scene.name === name));
  if (unknown.length) {
    fail(`Unknown scene(s): ${unknown.join(', ')}. Known: ${SCENES.map((s) => s.name).join(', ')}`);
  }
  return SCENES.filter((scene) => wanted.includes(scene.name));
}

// Letterbox the captured canvas onto the corpus canvas rather than stretching
// it: the app's canvas aspect follows the viewport, and squashing the drawing
// to fit would change the very composition the corpus exists to measure.
async function ontoCorpusCanvas(shot, aspect) {
  const [width, height] = CORPUS_DIMS[aspect];
  return sharp(shot)
    .resize(width, height, { fit: 'contain', background: PAPER.light.fill })
    .png()
    .toBuffer();
}

// The app's chrome — the drawer, the bin, the settings gear, the drawer's own
// chevron — sits over the canvas as ordinary buttons, and an element screenshot
// captures whatever the page paints in that region. Hiding every button leaves
// the drawing surface and nothing else. (Reading pixels off #drawingCanvas
// instead does not work: committed strokes live in the tiled renderer, and that
// element is the live surface, blank once a stroke has been committed.)
const CHROME_SELECTOR = 'button, [role="button"], dialog';

async function captureCanvasRegion(page) {
  await page.addStyleTag({ content: `${CHROME_SELECTOR} { visibility: hidden !important; }` });
  await sleep(CHROME_HIDE_SETTLE_MS);
  return await page.locator(DRAWING_CANVAS_SELECTOR).screenshot();
}

async function captureScene(browser, base, scene, brush) {
  const { ctx, page } = await openAppPage(browser, base, DEVICES[scene.aspect]);
  try {
    await expandDrawer(page);
    const box = await canvasBox(page);
    await STORE_DRAWINGS[scene.name](page, box, { brush });
    await sleep(CAPTURE_SETTLE_MS);
    return await captureCanvasRegion(page);
  } finally {
    await ctx.close();
  }
}

export async function generateCrayonInputs() {
  const brush = process.env.BRUSH || 'crayon';
  const port = Number(process.env.SPLOTCH_E2E_PORT || process.env.PORT || 4176);
  const scenes = selectedScenes();
  mkdirSync(OUT, { recursive: true });

  const { base, stop } = await ensureDevServer(port);
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const failures = [];
  console.log(`Capturing ${scenes.length} scene(s) with the ${brush} brush\n`);
  try {
    for (const scene of scenes) {
      process.stdout.write(`  ${brush}__${scene.name} … `);
      try {
        const shot = await captureScene(browser, base, scene, brush);
        const png = await ontoCorpusCanvas(shot, scene.aspect);
        const id = `${brush}__${scene.name.replace(/-(tall|wide)$/, '')}__${scene.aspect}`;
        writeFileSync(join(OUT, `${id}.png`), png);
        console.log('ok');
      } catch (err) {
        console.log(`failed: ${(err?.message || String(err)).split('\n')[0]}`);
        failures.push(scene.name);
      }
    }
  } finally {
    await browser.close();
    stop();
  }
  console.log(`\nWrote ${scenes.length - failures.length} input(s) → ${OUT}`);
  if (failures.length) fail(`Failed scene(s): ${failures.join(', ')}`);
}

if (isMain(import.meta.url)) await generateCrayonInputs();
