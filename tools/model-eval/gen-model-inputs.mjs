#!/usr/bin/env node
// Generate model-authored INPUT drawings for the eval corpus — canvas-plausible
// toddler art that could realistically have come off the Splotch drawing canvas.
// These complement the synthetic + asset-composite fixtures with model-drawn
// variety. Written into tools/model-eval/inputs/ under four category prefixes —
// `line` for stroke-only art with nothing filled in, `gen` for filled art,
// `scribble` for areas coloured in with visible back-and-forth passes, and
// `mess` for the sessions that are mostly noise — and left untouched by
// model-eval:fixtures, which only clears the categories it generates itself.
//
// Every prompt carries a `review` line: the verdict from looking at the image it
// produced, and what that sample is in the corpus to test. A sample that came
// back off-brief was either regenerated or renamed to what it actually is
// (`line__radial-ambiguous` asked for a spider and drew a starburst, which is a
// better test than the spider would have been). Deliberately not all good art:
// the `mess` ids are the sessions a prompt has to survive.
//
//   npm run model-eval:gen-inputs                  # (re)generate every authored input
//   AUTHOR=gemini npm run model-eval:gen-inputs    # author with Gemini instead
//   ONLY=line-,mess- npm run model-eval:gen-inputs  # only ids matching a substring
//                                                  (comma-separated: any match selects)
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
const ONLY = (process.env.ONLY || '')
  .split(',')
  .map((part) => part.trim())
  .filter(Boolean);

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

const SCRIBBLE_STYLE = `The image must look like it was drawn by a young child inside a simple toddler drawing app, NOT like a finished illustration. Rules:
- Plain near-white paper background (${PAPER.light.fill}), nothing else behind the drawing.
- Only these flat marker colors, no gradients, no shading: ${paletteList}.
- Areas are coloured in the way a toddler colours: visible back-and-forth passes of one marker, with paper still showing between the passes. Never a smooth even fill, never an airbrush.
- Outlines, where present, are the same medium even width as if drawn with one round marker tip.
- Simple, minimal, wobbly and imperfect. No text, no watermark, no border, no photorealism.`;

const STYLES = { filled: FILLED_STYLE, line: LINE_STYLE, scribble: SCRIBBLE_STYLE };

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

  // --- 2026-08 expansion: a wider spread of real toddler sessions ------------
  // Three aspect ratios, and deliberately not all good: the degenerate `mess`
  // ids are the sessions a prompt has to survive, not the ones it flatters.
  {
    id: 'line__bird-branch',
    style: 'line',
    dim: [1296, 864],
    prompt: 'One bird with a triangle beak sitting on a bare branch, and two short cloud curves.',
    review: 'good \u2014 clean outline, three colours, a subject plus two loose clouds',
  },
  {
    id: 'line__robot',
    style: 'line',
    dim: [864, 1296],
    prompt:
      'A robot: a square head with two dot eyes and an antenna, a box body, straight arms and legs.',
    review: 'good \u2014 boxy geometric outline \u2014 nothing organic to interpret',
  },
  {
    id: 'line__car-road',
    style: 'line',
    dim: [1296, 864],
    prompt: 'A car with two round wheels, driving on one straight road line, with a small sun.',
    review: 'good \u2014 sparse: a subject, a ground line, and two-thirds empty paper',
  },
  {
    id: 'line__snowman',
    style: 'line',
    dim: [864, 1296],
    prompt: 'A snowman: three stacked circles, two stick arms, two dot eyes, a hat.',
    review: 'good \u2014 stacked circles, the classic toddler build',
  },
  {
    id: 'line__balloon',
    style: 'line',
    dim: [864, 1296],
    prompt: 'One big balloon on a long curly string, nothing else on the page.',
    review: 'good \u2014 one subject on an otherwise empty page \u2014 maximum room to invent',
  },
  {
    id: 'line__icecream',
    style: 'line',
    dim: [864, 1296],
    prompt: 'An ice cream cone: a triangle cone and two scoop circles on top.',
    review: 'good \u2014 pure geometry: two circles and a triangle',
  },
  {
    id: 'line__butterfly-outline',
    style: 'line',
    dim: [1024, 1024],
    prompt: 'A butterfly seen from above: a thin body, two big wing loops each side, two antennae.',
    review: 'good \u2014 open loops, no closed body \u2014 nothing is fillable',
  },
  {
    id: 'line__radial-ambiguous',
    style: 'line',
    dim: [1024, 1024],
    prompt: 'A spider: one circle body with eight straight legs, hanging from one thread line.',
    review:
      'good \u2014 deliberately ambiguous: a circle with radiating lines reads as a sun or a spider',
  },
  {
    id: 'line__dino',
    style: 'line',
    dim: [1296, 864],
    prompt: 'A long-necked dinosaur outline with a row of triangle spikes down its back.',
    review: 'good \u2014 one long outline with a rhythm of spikes along it',
  },
  {
    id: 'line__face',
    style: 'line',
    dim: [1024, 1024],
    prompt:
      'One big smiling face filling most of the page: circle, two eyes, a nose, a wide smile.',
    review: 'good \u2014 a face filling the frame \u2014 the case that tempts a portrait',
  },
  {
    id: 'line__ladder-cloud',
    style: 'line',
    dim: [864, 1296],
    prompt: 'A tall ladder leaning up into a single cloud. Nothing else.',
    review: 'good \u2014 a juxtaposition with no real-world logic to fall back on',
  },
  {
    id: 'line__crown-star',
    style: 'line',
    dim: [1296, 864],
    prompt: 'A crown with three points and one lopsided five-pointed star beside it.',
    review: 'good \u2014 two unrelated flat symbols, multi-coloured strokes on one shape',
  },
  {
    id: 'gen__apple-tree',
    style: 'filled',
    dim: [1024, 1024],
    prompt: "A child's drawing of a tree with a brown trunk, a green top, and three red apples.",
    review: 'good \u2014 solid flat fills, the shapes closed and coloured',
  },
  {
    id: 'gen__train',
    style: 'filled',
    dim: [1296, 864],
    prompt: "A child's drawing of a train: two coloured boxes, round wheels, and a puff of smoke.",
    review: 'good \u2014 solid blocks with black wheels on empty paper',
  },
  {
    id: 'gen__pizza',
    style: 'filled',
    dim: [1024, 1024],
    prompt: "A child's drawing of a round pizza with red sauce and coloured dots for toppings.",
    review:
      'good \u2014 one big filled disc with scattered dots \u2014 a fill that is the whole subject',
  },
  {
    id: 'gen__frog-pond',
    style: 'filled',
    dim: [1296, 864],
    prompt: "A child's drawing of a green frog beside a blue pond with two lily pads.",
    review: 'good \u2014 hatch fill kept inside outlines, two separated subjects',
  },
  {
    id: 'gen__birthday-cake',
    style: 'filled',
    dim: [864, 1296],
    prompt: "A child's drawing of a birthday cake with three candles and coloured icing.",
    review:
      'polished \u2014 reads more finished than a toddler would draw \u2014 the too-neat end of the range',
  },
  {
    id: 'gen__castle',
    style: 'filled',
    dim: [864, 1296],
    prompt: "A child's drawing of a castle: two towers, a door, and a flag on top.",
    review: 'good \u2014 hatch fill inside a drawn outline, tall composition',
  },
  {
    id: 'gen__sheep-field',
    style: 'filled',
    dim: [1296, 864],
    prompt: "A child's drawing of two white sheep standing on green grass under a yellow sun.",
    review: 'good \u2014 grass drawn as separate vertical strokes rather than a filled band',
  },
  {
    id: 'gen__flowerpot',
    style: 'filled',
    dim: [864, 1296],
    prompt: "A child's drawing of one flower in a brown pot on a table line.",
    review: 'good \u2014 hatch fill plus a single ruled ground line',
  },
  {
    id: 'gen__ladybug',
    style: 'filled',
    dim: [1024, 1024],
    prompt: "A child's drawing of a red ladybug with black spots on a big green leaf.",
    review:
      'polished \u2014 smooth vector-like fills \u2014 the far end of what the app could produce',
  },
  {
    id: 'gen__umbrella-rain',
    style: 'filled',
    dim: [864, 1296],
    prompt: "A child's drawing of an orange umbrella with blue raindrops falling around it.",
    review: 'good \u2014 one hatch-filled subject and a scatter of small marks',
  },
  {
    id: 'scribble__sky-house',
    style: 'scribble',
    dim: [1296, 864],
    prompt:
      'A simple outlined house with the whole sky above it scribbled in blue and the ground scribbled in green.',
    review:
      'good \u2014 the fill case at full strength: sky and ground both scribbled around an outline',
  },
  {
    id: 'scribble__pond-duck',
    style: 'scribble',
    dim: [1024, 1024],
    prompt: 'A duck outline sitting on a wide band of blue back-and-forth scribble for water.',
    review: 'good \u2014 a scribbled band of water under an unfilled subject',
  },
  {
    id: 'scribble__half-coloured',
    style: 'scribble',
    dim: [864, 1296],
    prompt:
      'A big flower outline where only the left half of the petals has been scribbled in with orange, the right half left as bare outline.',
    review: 'good \u2014 half the petals coloured, half left bare \u2014 an abandoned session',
  },
  {
    id: 'scribble__over-the-lines',
    style: 'scribble',
    dim: [1024, 1024],
    prompt:
      'A simple car outline scribbled in red, with the red scribble spilling well outside the outline onto the paper.',
    review: 'good \u2014 fill spilling well outside the outline it belongs to',
  },
  {
    id: 'scribble__two-tone',
    style: 'scribble',
    dim: [864, 1296],
    prompt: 'One big balloon outline scribbled half in purple and half in yellow, with a string.',
    review: 'good \u2014 one shape filled in two colours that meet down the middle',
  },
  {
    id: 'scribble__sun-corner',
    style: 'scribble',
    dim: [1296, 864],
    prompt:
      'A yellow sun in the top corner scribbled solidly in, and one long green line for the ground. The rest of the page is empty paper.',
    review: 'good \u2014 one filled sun, one line, and a page of nothing',
  },
  {
    id: 'mess__dots',
    style: 'line',
    dim: [1024, 1024],
    prompt:
      'About fifteen separate short dots and dashes scattered randomly across the page, no subject at all.',
    review: 'bad \u2014 fifteen unconnected dots and dashes \u2014 no subject at all',
  },
  {
    id: 'mess__corner-crammed',
    style: 'line',
    dim: [1296, 864],
    prompt:
      'A tiny simple house drawn very small in the bottom-left corner. The rest of the page is completely empty.',
    review: 'bad \u2014 a tiny drawing in one corner of a huge empty page',
  },
  {
    id: 'mess__off-edge',
    style: 'line',
    dim: [864, 1296],
    prompt:
      'A large shape drawn so big it runs off the top and right edges of the page, cut off by the paper.',
    review: 'bad \u2014 a shape drawn so large it runs off two edges',
  },
  {
    id: 'mess__overdrawn',
    style: 'line',
    dim: [1024, 1024],
    prompt:
      'A dense heavily overdrawn scribble covering the middle of the page, scribbled over so many times the strokes have gone dark and solid.',
    review: 'bad \u2014 a dense multi-colour tangle covering the middle',
  },
  {
    id: 'mess__open-circle',
    style: 'line',
    dim: [1024, 1024],
    prompt:
      'One large wobbly circle that does not quite join up, with a gap in it. Nothing else on the page.',
    review: 'bad \u2014 a single wobbly circle that never closes',
  },
  {
    id: 'mess__letters',
    style: 'line',
    dim: [1296, 864],
    prompt:
      'Five or six scrawled letter-like shapes in a row, the way a toddler pretends to write. Not real words.',
    review: 'bad \u2014 pretend writing \u2014 the text-hallucination probe',
  },
  {
    id: 'mess__two-unrelated',
    style: 'line',
    dim: [1296, 864],
    prompt:
      'A fish drawn in the far top-left corner and a car drawn in the far bottom-right corner, with nothing between them.',
    review: 'bad \u2014 two subjects in opposite corners with nothing between them',
  },
  {
    id: 'mess__mud',
    style: 'scribble',
    dim: [1024, 1024],
    prompt:
      'Every colour scribbled over the top of every other colour until the middle of the page has gone muddy brown-grey.',
    review: 'bad \u2014 every colour scribbled over every other colour',
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

  const selected = PROMPTS.filter(
    (prompt) => !ONLY.length || ONLY.some((part) => prompt.id.includes(part))
  );
  if (!selected.length) {
    console.error(`No prompts matched ONLY="${ONLY.join(',')}".`);
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
