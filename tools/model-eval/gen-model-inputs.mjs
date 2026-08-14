#!/usr/bin/env node
// Generate model-authored INPUT drawings for the eval corpus — canvas-plausible
// toddler art that could realistically have come off the Splotch drawing canvas.
// These complement the synthetic + asset-composite fixtures with model-drawn
// variety. Written into tools/model-eval/inputs/ under two category prefixes —
// `gen` for filled art, `line` for stroke-only art with nothing filled in — and
// left untouched by model-eval:fixtures.
//
//   npm run model-eval:gen-inputs                  # (re)generate every authored input
//   AUTHOR=gemini npm run model-eval:gen-inputs    # author with Gemini instead
//   ONLY=line- npm run model-eval:gen-inputs       # only ids matching a substring
//
// Requires the selected author's API key: OPENAI_API_KEY (default) or GEMINI_API_KEY.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, PALETTE, PAPER, imageFormat } from './lib/model-eval.mjs';
import { callVariant } from './lib/image-providers.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { requireEnv } from '../lib/proc.mjs';

const OUT = join(ROOT, 'tools/model-eval/inputs');
const ONLY = process.env.ONLY || '';

// The author is a normal harness variant, so it goes through the same adapters
// the evaluation does rather than a second, separately-drifting call path.
const AUTHORS = {
  openai: {
    key: 'author-openai',
    label: 'gpt-image-2 (author)',
    provider: 'openai',
    model: 'gpt-image-2',
    quality: 'medium',
    role: 'input author',
  },
  gemini: {
    key: 'author-gemini',
    label: 'gemini-3.1-flash-image (author)',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    quality: null,
    role: 'input author',
  },
};
const PROVIDER_KEY_ENV = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };

const hexesFor = (labels) =>
  labels.map((label) => PALETTE.find((color) => color.label === label).hex).join(' ');
const paletteList = PALETTE.map((c) => `${c.label} ${c.hex}`).join(', ');

// The six swatches a toddler reaches for first — the core crayon box every
// viewport shows. Named by label so a palette re-hex can't silently desync the
// corpus from the colors the app can actually lay down.
const CORE_SIX = hexesFor(['Purple', 'Blue', 'Green', 'Yellow', 'Orange', 'Red']);

// Filled art: solid shapes and scribble fill, the case DEFAULT_PROMPT's
// "treat the coloring as intent" clause exists for.
const FILLED_STYLE = `The image must look like it was drawn by a young child inside a simple toddler drawing app, NOT like a finished illustration. Rules:
- Plain near-white paper background (${PAPER.light.fill}), nothing else behind the drawing.
- Only these flat marker colors, no gradients, no shading, no outlines-plus-shading: ${paletteList}.
- Medium, even brush strokes; a few solid-filled shapes; at most a little loose back-and-forth scribble fill.
- Simple, minimal, a bit wobbly and imperfect. No text, no watermark, no border, no photorealism.`;

// Line art: strokes only, nothing filled. The harder input — with no color to
// read as intent, a model is free to invent a palette, and this is where
// embellishment shows up.
const LINE_STYLE = `Generate a simple line drawing using only medium pen strokes of the following colors:

${CORE_SIX}

Keep it simple with minimal strokes and detail. Rules:
- Plain near-white paper background (${PAPER.light.fill}), nothing else behind the drawing.
- Open outlines only — nothing filled in, no shading, no gradients, no texture.
- Every stroke is the same medium, even width, as if drawn with one round marker tip.
- Wobbly and imperfect, the way a 3-year-old draws. No text, no watermark, no border.`;

const STYLES = { filled: FILLED_STYLE, line: LINE_STYLE };

const PROMPTS = [
  {
    id: 'gen__boat-pond',
    style: 'filled',
    dim: [1024, 1024],
    prompt: "A child's drawing of a red boat on blue water with a yellow sun.",
  },
  {
    id: 'gen__rainbow-cloud',
    style: 'filled',
    dim: [1296, 864],
    prompt: "A child's drawing of a rainbow with two clouds and some grass.",
  },
  {
    id: 'gen__dog-ball',
    style: 'filled',
    dim: [1024, 1024],
    prompt: "A child's drawing of a brown dog next to an orange ball on green grass.",
  },
  {
    id: 'gen__rocket-stars',
    style: 'filled',
    dim: [864, 1296],
    prompt: "A child's drawing of a purple rocket ship flying past yellow stars.",
  },
  {
    id: 'gen__butterfly-flowers',
    style: 'filled',
    dim: [1296, 864],
    prompt: "A child's drawing of a pink butterfly over three simple flowers.",
  },
  // --- Line-only cases -------------------------------------------------------
  {
    id: 'line__cat',
    style: 'line',
    dim: [1024, 1024],
    prompt: 'A cat sitting, drawn as an outline: a circle head, two triangle ears, a body, a tail.',
  },
  {
    id: 'line__house-sun',
    style: 'line',
    dim: [1296, 864],
    prompt: 'A square house with a triangle roof, one window, a door, and a sun in the corner.',
  },
  {
    id: 'line__person-flower',
    style: 'line',
    dim: [864, 1296],
    prompt: 'A stick-figure person standing next to one tall flower.',
  },
  {
    id: 'line__fish',
    style: 'line',
    dim: [1296, 864],
    prompt: 'One fish with a triangle tail and a dot eye, and three short wavy water lines.',
  },
  {
    id: 'line__truck',
    style: 'line',
    dim: [1296, 864],
    prompt: 'A truck: one big box, one small box for the cab, two circle wheels.',
  },
  // --- Degenerate cases ------------------------------------------------------
  // Real toddler sessions produce a lot of these, and they are where a model
  // either respects "keep the composition" or invents a whole scene.
  {
    id: 'line__scribble',
    style: 'line',
    dim: [1024, 1024],
    prompt:
      'A dense tangle of overlapping loops and zigzags with no recognizable subject at all — pure scribble.',
  },
  {
    id: 'line__one-stroke',
    style: 'line',
    dim: [1024, 1024],
    prompt:
      'One single wobbly line arcing across the middle of the page. Nothing else on the page at all.',
  },
];

function authorImage(author, prompt, apiKey, blank) {
  return callVariant(author, {
    apiKeys: { [author.provider]: apiKey },
    // Authoring is text-to-image, but both adapters take a drawing to transform.
    // A blank sheet of the app's own paper is the honest empty canvas, and it
    // also pins the output's aspect ratio to the one we asked for.
    image: blank,
    prompt: `${prompt.prompt}\n\n${STYLES[prompt.style]}`,
    systemInstruction:
      'You produce raw input drawings for a test corpus. Follow the drawing rules exactly and output only the drawing.',
    timeoutMs: 300_000,
  });
}

// A solid sheet of the app's light paper at the requested size, as the base
// image both adapters transform. Rendered in the browser we already launch.
async function blankPaper(page, [width, height]) {
  const dataUrl = await page.evaluate(
    ({ width, height, paper }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png');
    },
    { width, height, paper: PAPER.light.fill }
  );
  return {
    base64: dataUrl.split(',')[1],
    mimeType: 'image/png',
    width,
    height,
  };
}

// Normalize onto the target canvas size + paper so all inputs match the corpus.
async function normalizeOntoPaper(page, raw, format, [width, height]) {
  await page.setContent(`<canvas id="c" width="${width}" height="${height}"></canvas>`);
  const dataUrl = await page.evaluate(
    async ({ uri, width, height, paper }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = uri;
      });
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, width, height);
      const scale = Math.min(width / img.width, height / img.height);
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      ctx.drawImage(img, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      return canvas.toDataURL('image/png');
    },
    {
      uri: `data:image/${format};base64,${raw.toString('base64')}`,
      width,
      height,
      paper: PAPER.light.fill,
    }
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function main() {
  const authorName = process.env.AUTHOR || 'openai';
  const author = AUTHORS[authorName];
  if (!author) {
    console.error(
      `Unknown AUTHOR="${authorName}". Choose one of: ${Object.keys(AUTHORS).join(', ')}`
    );
    process.exit(1);
  }
  requireEnv(PROVIDER_KEY_ENV[author.provider], 'set it in web/.env or export it');
  const apiKey = process.env[PROVIDER_KEY_ENV[author.provider]];

  const selected = PROMPTS.filter((prompt) => !ONLY || prompt.id.includes(ONLY));
  if (!selected.length) {
    console.error(`No prompts matched ONLY="${ONLY}".`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const page = await browser.newPage();

  const failures = [];
  console.log(`Authoring ${selected.length} input(s) with ${author.label}\n`);
  for (const prompt of selected) {
    process.stdout.write(`  ${prompt.id} … `);
    const blank = await blankPaper(page, prompt.dim);
    const result = await authorImage(author, prompt, apiKey, blank);
    if (result.kind !== 'image') {
      console.log(`${result.kind}: ${(result.reason || '').slice(0, 120)}`);
      failures.push(prompt.id);
      continue;
    }
    const raw = Buffer.from(result.data, 'base64');
    const format = imageFormat(raw);
    if (format === 'other') {
      console.log('unrecognized image format');
      failures.push(prompt.id);
      continue;
    }
    const [width, height] = prompt.dim;
    const png = await normalizeOntoPaper(page, raw, format, prompt.dim);
    const aspect = width === height ? 'square' : width > height ? 'wide' : 'tall';
    writeFileSync(join(OUT, `${prompt.id}__${aspect}.png`), png);
    console.log(`ok (${result.ms}ms)`);
  }
  await browser.close();

  if (failures.length) {
    console.error(`\n${failures.length} input(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

await main();
