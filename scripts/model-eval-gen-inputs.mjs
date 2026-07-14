#!/usr/bin/env node
// Generate a few Gemini-authored INPUT drawings for the eval corpus — canvas-plausible
// toddler art (solid fills, medium palette strokes, minimal squiggles) that could
// realistically have come off the Splotch drawing canvas. These complement the
// synthetic + asset-composite fixtures with model-drawn variety. Saved with a `gen`
// prefix into web/tests/model-eval/inputs/ and left untouched by model-eval:fixtures.
//
//   npm run model-eval:gen-inputs        # (re)generate the gen__* inputs
//
// Requires GEMINI_API_KEY. Uses gemini-3.1-flash-image as the author.

import { GoogleGenAI } from '@google/genai';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, PALETTE, PAPER, CHROMIUM_PATH } from './lib/model-eval.mjs';

const OUT = join(ROOT, 'web/tests/model-eval/inputs');
const AUTHOR_MODEL = 'gemini-3.1-flash-image';

const paletteList = PALETTE.map((c) => `${c.label} ${c.hex}`).join(', ');
const STYLE = `The image must look like it was drawn by a young child inside a simple toddler drawing app, NOT like a finished illustration. Rules:
- Plain near-white paper background (${PAPER.light.fill}), nothing else behind the drawing.
- Only these flat marker colors, no gradients, no shading, no outlines-plus-shading: ${paletteList}.
- Medium, even brush strokes; a few solid-filled shapes; at most a little loose back-and-forth scribble fill.
- Simple, minimal, a bit wobbly and imperfect. No text, no watermark, no border, no photorealism.`;

const PROMPTS = [
  {
    id: 'gen__boat-pond',
    dim: [1024, 1024],
    prompt: "A child's drawing of a red boat on blue water with a yellow sun.",
  },
  {
    id: 'gen__rainbow-cloud',
    dim: [1296, 864],
    prompt: "A child's drawing of a rainbow with two clouds and some grass.",
  },
  {
    id: 'gen__dog-ball',
    dim: [1024, 1024],
    prompt: "A child's drawing of a brown dog next to an orange ball on green grass.",
  },
  {
    id: 'gen__rocket-stars',
    dim: [864, 1296],
    prompt: "A child's drawing of a purple rocket ship flying past yellow stars.",
  },
  {
    id: 'gen__butterfly-flowers',
    dim: [1296, 864],
    prompt: "A child's drawing of a pink butterfly over three simple flowers.",
  },
];

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const page = await browser.newPage();

  for (const p of PROMPTS) {
    process.stdout.write(`  ${p.id} … `);
    let raw = null;
    try {
      const r = await ai.models.generateContent({
        model: AUTHOR_MODEL,
        contents: [{ role: 'user', parts: [{ text: `${p.prompt}\n\n${STYLE}` }] }],
        config: { abortSignal: AbortSignal.timeout(120_000) },
      });
      const part = (r.candidates?.[0]?.content?.parts ?? []).find((x) => x.inlineData?.data);
      if (part) raw = Buffer.from(part.inlineData.data, 'base64');
    } catch (err) {
      console.log('ERR', (err?.message || String(err)).split('\n')[0]);
      continue;
    }
    if (!raw) {
      console.log('no image');
      continue;
    }
    // Normalize onto the target canvas size + paper so all inputs match the corpus.
    const [w, h] = p.dim;
    await page.setContent(`<canvas id="c" width="${w}" height="${h}"></canvas>`);
    const dataUri = `data:image/*;base64,${raw.toString('base64')}`;
    const png = await page.evaluate(
      async ({ uri, w, h, paper }) => {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = uri;
        });
        const c = document.getElementById('c');
        const ctx = c.getContext('2d');
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, w, h);
        const s = Math.min(w / img.width, h / img.height);
        const dw = img.width * s,
          dh = img.height * s;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        return c.toDataURL('image/png');
      },
      { uri: dataUri, w, h, paper: PAPER.light.fill }
    );
    const dim = w === h ? 'square' : w > h ? 'wide' : 'tall';
    writeFileSync(join(OUT, `${p.id}__${dim}.png`), Buffer.from(png.split(',')[1], 'base64'));
    console.log('ok');
  }
  await browser.close();
}

await main();
