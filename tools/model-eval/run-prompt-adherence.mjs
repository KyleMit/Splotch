#!/usr/bin/env node
// Prompt-adherence lab: iterate on the generate-image prompt and image-tool
// config until the produced illustration keeps the child's composition.
//
// The bake-off (run-model-evaluation.mjs) compares MODELS under the one
// production config; this lab holds the model fixed and compares PROMPTS (and
// image-tool knobs like input_fidelity) against the composition-adherence
// scorer in lib/composition-score.mjs. Its corpus defaults to the sparse
// compositions where drift shows — a small subject with open paper around it
// is what gpt-image-2 loves to enlarge and recenter.
//
// The 2026-08 rounds that reworded the production prompt (the runs behind
// scrapbook/model-eval/prompt-adherence/) measured: legacy "reimagine"
// framing 63.6 mean layout score over the 19-input sweep, the shipped
// "paint directly over" framing 85.4, input_fidelity=high on gpt-image-1.5
// low 71.3 at 3.6× the cost (gpt-image-2 rejects the parameter outright).
//
// MANUAL, real-token tool — NOT part of `npm test`. Requires OPENAI_API_KEY.
//
//   npm run model-eval:adherence                    # focus corpus × default arms
//   FILTER=toysword npm run model-eval:adherence    # one input
//   LABS=baseline,legacy npm run model-eval:adherence
//   SAMPLES=2 CONCURRENCY=4 npm run model-eval:adherence
//
// Env: FILTER (input id substring), LABS (comma-separated exact lab keys),
// SAMPLES (default 1), CONCURRENCY (default 4), OUT_TAG (run-dir suffix),
// INPUTS (comma-separated input ids to replace the focus corpus),
// REPORT_FROM=<run dir> (rebuild report/ from results.json, no API calls).

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  ROOT,
  VARIANTS,
  DEFAULT_PROMPT,
  SAFETY_SYSTEM_INSTRUCTION,
  assertProductionConfig,
  costOf,
  imageDims,
  imageFormat,
} from './lib/model-eval.mjs';
import { buildPromptForStyle } from '../../web/src/lib/ai/prompt.ts';
import { callVariant } from './lib/image-providers.mjs';
import { scoreComposition } from './lib/composition-score.mjs';
import { esc } from '../lib/html.mjs';
import { fail, requireEnv, runId as makeRunId } from '../lib/proc.mjs';

// A zero, negative, or non-numeric count would silently produce an empty run —
// zero workers in pool(), or zero tasks — that still writes a success-looking
// report. For a paid measurement tool that misconfiguration must fail fast.
function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    fail(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

const BASE = join(ROOT, 'tools/model-eval');
const IN = join(BASE, 'inputs');
const SAMPLES = positiveIntEnv('SAMPLES', 1);
const CONCURRENCY = positiveIntEnv('CONCURRENCY', 4);
const FILTER = process.env.FILTER || '';
const LAB_FILTER = (process.env.LABS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);
const CALL_TIMEOUT_MS = 300_000;

// Report images are thumbnailed so a run's report/ folder is small enough to
// promote into the committed scrapbook tree (ADR-0059); the full-size outputs
// stay beside it in the run dir.
const REPORT_THUMB_LONG_SIDE_PX = 512;
const REPORT_THUMB_JPEG_QUALITY = 82;

// The default arm model is the cheapest candidate tier — it is the one that
// drifts, and the one production picked (web/src/lib/server/ai/openai.ts). A
// lab may override `variant` to pit another model+knob combo against the same
// prompts; gpt-image-1.5 is the newest OpenAI model that still accepts
// input_fidelity (gpt-image-2 rejects the parameter with a 400).
const DEFAULT_VARIANT = VARIANTS.find((v) => v.key === 'gpt-image-2-low');
const GPT_IMAGE_1_5_LOW = {
  key: 'gpt-image-1-5-low',
  label: 'gpt-image-1.5 · low',
  provider: 'openai',
  model: 'gpt-image-1.5',
  quality: 'low',
  role: 'adherence-lab arm',
};

// Sparse, structured compositions where enlarging/recentering is visible; the
// dense coloring-book categories hide drift because the subject already fills
// the frame.
const FOCUS_INPUT_IDS = [
  'safety__toysword__tall',
  'gen__boat-pond__square',
  'gen__rocket-stars__tall',
  'line__fish__wide',
  'line__house-sun__wide',
  'scribble-1color__blue__tall',
];

// The pre-2026-08 production prompt, kept as a regression arm: it asked the
// model to "reimagine" the drawing, and gpt-image-2 · low read that as license
// to enlarge and recenter the subject.
const LEGACY_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Pay special attention to the ground: render it as one solidly filled area of even color.";

// Retained experiment arms from the 2026-08 rounds, so a future iteration can
// re-measure against everything already tried rather than re-deriving it.
const LAYOUT_LOCK_SUFFIX =
  ' Keep the composition exactly as the child placed it: every element stays at its own position and its own size relative to the frame. Do not enlarge the main subject, do not zoom in, and do not move things to the center. If the child drew elements apart from each other, keep them apart — do not attach, merge, or regroup them. Areas the child left empty stay open and airy; do not fill them with new objects or scenery.';

const ANCHOR_SUFFIX =
  ' The finished illustration must line up with the child’s drawing if laid on top of it: every element the child drew keeps its own position and its own size within the frame — never enlarged, never pulled to the center, never joined to another element. If the child drew things apart, they stay apart. Enrich the open space around them with atmosphere — sky, light, and ground color — not with new objects or characters.';

// The strict overlay wording without the atmosphere license: highest measured
// adherence (91.6 vs the shipped prompt's 89.4 on the focus corpus), but it
// leaves backgrounds bare paper — faithful yet timid.
const OVERLAY_STRICT_PROMPT =
  "Paint directly over this child's drawing so the finished picture lines up with the original: every shape stays exactly where the child drew it, at exactly the size the child drew it. Polish each drawn shape in place into a warm, whimsical illustration — vibrant color, charming details, soft light — without moving, enlarging, shrinking, or rearranging anything, and without zooming in or cropping. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Areas the child left empty stay open — do not add objects the child did not draw.";

// The production dark-scene suffix, recovered from the app's own prompt
// assembly rather than copied, so the night arm cannot drift from it.
function darkScenePrompt() {
  return buildPromptForStyle(null, {}, 'dark').slice(DEFAULT_PROMPT.length).trim();
}

// Candidate arms for restoring imagination on top of the anchoring win. The
// shipped overlay wording keeps placement but also reads as license to trace,
// so a stick figure comes back a stick figure. Both arms keep the placement
// rules and add an explicit instruction to render what each shape MEANS as a
// fully realized subject; `realized-magic` also licenses proportion changes
// and a slight nudge in position.
const REALIZED_PROMPT =
  "Paint over this child's drawing so the finished picture keeps the child's composition: every shape the child drew stays about where they drew it and about the size they drew it, and nothing is pulled to the center, blown up to fill the frame, zoomed into, or cropped. Within that layout, bring the drawing all the way to life. Read what the child meant each shape to be and paint that thing for real, the way a finished storybook illustration would: a stick figure becomes a whole character with a body, clothes, hair, and an expression; a circle ringed with lines becomes a real sun; a box on wheels becomes a real vehicle. Give each subject proper form, volume, texture, and small charming details, keeping its place, its scale, its pose, and the colors the child chose - you may reshape its proportions and nudge it a little when that is what it takes to make it a believable, fully realized subject rather than a traced outline. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Fill the open background with the atmosphere and setting the drawing suggests - sky, light, water, ground, soft distant scenery - in even washes, but never with new characters or objects that would compete with what the child drew.";

const REALIZED_MAGIC_PROMPT =
  "Turn this child's drawing into a magical, fully realized illustration painted over the top of it, so the finished picture still reads as the child's own picture: each thing they drew stays about where they put it and about the size they made it - no pulling things to the center, no blowing the subject up to fill the frame, no zooming or cropping - and things they drew apart stay apart. Everything else is yours to realize. Read what each shape is meant to be and paint it as that thing for real, with proper form, volume, texture, warm light, and charming detail: a stick figure becomes a whole character with a body, clothes, hair, and an expression; a lumpy oval becomes a real animal with fur and eyes; a wobbly box becomes a real house with a roof and windows. Keep the child's colors and each subject's pose and gesture, but you have license to refine its proportions, give it depth, and nudge it slightly so it stands convincingly in the scene. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Give the picture a real place to happen in: fill the open background with the setting the drawing implies - sky, weather, light, water, ground, soft distant scenery - and let a little wonder in through light, color, and atmosphere rather than through new characters or props the child did not draw.";

// Round-two candidates, from review of the round-one arms: realizing a stick
// figure into a rendered child is too big a shift (a stick figure is allowed
// to stay sticky), the realized arms read as 3D rather than drawn, and the
// thing actually worth enriching is the world around the marks rather than
// the marks themselves. Both keep the child's strokes, finish closed shapes,
// pin the medium to hand-drawn, and license invention on abstract squiggles;
// `drawn-world-rich` spends far more of that license on the setting.
const DRAWN_WORLD_PROMPT =
  "Paint over this child's drawing to bring it to life without taking it over. Keep the marks the child made as the marks the child made: their lines stay their lines, in the same place, at the same size, with the same wobble and the same color. Do not redraw a drawn figure as a realistic person - if the child drew a stick figure, it stays a stick figure, only warmer and better coloured. Where the child closed a shape, though - a house, a boat, an animal's body, a sun, a balloon - finish it as the real thing it is: fill it in and give it the surfaces and small details that thing would really have, such as walls, a roof, windows, petals, fur, or fabric, all kept inside the outline they drew. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Then bring the world around the drawing to life, because bare paper is the one thing the finished picture should never be: fill the empty space with the setting the drawing implies - sky, weather, light, water, ground, grass, a few flowers or drifting clouds - so the marks sit in a real place, and never add a character or object that would compete with what the child drew. If the child's marks do not depict anything in particular - loose squiggles, a few stray lines - play the game of making those exact lines add up to something: leave every line exactly where it is and invent the playful, magical picture that makes them all make sense together. Render everything as a hand-drawn children's book illustration on paper - crayon, colored pencil, gouache, or soft watercolor, with flat colour and a little paper grain. Never a 3D render: no glossy plastic surfaces, no inflated balloon shapes, no airbrushed CGI shine.";

const DRAWN_WORLD_RICH_PROMPT =
  "Paint over this child's drawing to bring it to life without taking it over. Keep the marks the child made as the marks the child made: their lines stay their lines, in the same place, at the same size, with the same wobble and the same color. Do not redraw a drawn figure as a realistic person - if the child drew a stick figure, it stays a stick figure, only warmer and better coloured. Where the child closed a shape, though - a house, a boat, an animal's body, a sun, a balloon - finish it as the real thing it is: fill it in and give it the surfaces and small details that thing would really have, such as walls, a roof, windows, petals, fur, or fabric, all kept inside the outline they drew. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Everything the child left empty is yours to fill, and filling it generously is the point: build the drawing a whole storybook world to sit in - sky and weather, distant hills, water, a grassy field with flowers, blossom, butterflies, birds far off, warm light coming from somewhere - so the page feels like a place rather than a sheet of paper. Keep that world behind and around the child's marks: it may be as rich as you like, but nothing you add may sit on top of what they drew, compete with it for attention, or become a second main character. If the child's marks do not depict anything in particular - loose squiggles, a few stray lines - play the game of making those exact lines add up to something: leave every line exactly where it is and invent the playful, magical picture that makes them all make sense together. Render everything as a hand-drawn children's book illustration on paper - crayon, colored pencil, gouache, or soft watercolor, with flat colour and a little paper grain. Never a 3D render: no glossy plastic surfaces, no inflated balloon shapes, no airbrushed CGI shine.";

const LABS = [
  { key: 'baseline', label: 'production prompt', prompt: DEFAULT_PROMPT, imageToolOverrides: {} },
  {
    key: 'legacy',
    label: 'pre-2026-08 "reimagine" prompt',
    prompt: LEGACY_PROMPT,
    imageToolOverrides: {},
  },
  {
    key: 'overlay-strict',
    label: 'overlay wording without atmosphere license',
    prompt: OVERLAY_STRICT_PROMPT,
    imageToolOverrides: {},
  },
  {
    key: 'layout-lock',
    label: 'legacy + layout-lock suffix',
    prompt: LEGACY_PROMPT + LAYOUT_LOCK_SUFFIX,
    imageToolOverrides: {},
  },
  {
    key: 'anchored',
    label: 'legacy + anchor suffix',
    prompt: LEGACY_PROMPT + ANCHOR_SUFFIX,
    imageToolOverrides: {},
  },
  {
    key: 'fidelity15',
    label: 'gpt-image-1.5 low · production prompt + input_fidelity high',
    prompt: DEFAULT_PROMPT,
    imageToolOverrides: { input_fidelity: 'high' },
    variant: GPT_IMAGE_1_5_LOW,
  },
  {
    key: 'realized',
    label: 'anchored placement + fully-realized subjects',
    prompt: REALIZED_PROMPT,
    imageToolOverrides: {},
  },
  {
    key: 'realized-magic',
    label: 'fully-realized subjects + reshape/nudge license',
    prompt: REALIZED_MAGIC_PROMPT,
    imageToolOverrides: {},
  },
  {
    key: 'drawn-world',
    label: 'keep the strokes, finish shapes, wake the world',
    prompt: DRAWN_WORLD_PROMPT,
    imageToolOverrides: {},
  },
  {
    key: 'drawn-world-rich',
    label: 'same, with a full storybook setting',
    prompt: DRAWN_WORLD_RICH_PROMPT,
    imageToolOverrides: {},
  },
  {
    key: 'night',
    label: 'production prompt + dark-scene suffix',
    prompt: `${DEFAULT_PROMPT} ${darkScenePrompt()}`,
    imageToolOverrides: {},
  },
];

// Arms a bare `npm run model-eval:adherence` compares; the historical and
// situational arms opt in via LABS.
const DEFAULT_LAB_KEYS = ['baseline', 'legacy'];

async function pool(thunks, size) {
  const results = new Array(thunks.length);
  let next = 0;
  async function worker() {
    while (next < thunks.length) {
      const i = next++;
      results[i] = await thunks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, thunks.length) }, worker));
  return results;
}

function selectLabs() {
  const wanted = LAB_FILTER.length ? LAB_FILTER : DEFAULT_LAB_KEYS;
  const unknown = wanted.filter((key) => !LABS.some((lab) => lab.key === key));
  if (unknown.length) {
    console.error(
      `Unknown lab key(s): ${unknown.join(', ')}. Keys: ${LABS.map((l) => l.key).join(', ')}`
    );
    process.exit(1);
  }
  return wanted.map((key) => LABS.find((lab) => lab.key === key));
}

function loadInputs() {
  if (!existsSync(IN)) {
    console.error(`No inputs at ${IN}. Run: npm run model-eval:fixtures`);
    process.exit(1);
  }
  const available = readdirSync(IN).filter((f) => f.endsWith('.png'));
  const wanted = process.env.INPUTS
    ? process.env.INPUTS.split(',').map((id) => `${id.trim()}.png`)
    : FOCUS_INPUT_IDS.map((id) => `${id}.png`);
  const files = wanted.filter((f) => available.includes(f)).filter((f) => f.includes(FILTER));
  const missing = wanted.filter((f) => !available.includes(f));
  if (missing.length) console.warn(`Skipping missing inputs: ${missing.join(', ')}`);
  if (!files.length) {
    console.error('No inputs selected.');
    process.exit(1);
  }
  return files.map((file) => {
    const bytes = readFileSync(join(IN, file));
    const [width, height] = (imageDims(bytes) ?? '0x0').split('x').map(Number);
    return {
      id: file.replace(/\.png$/, ''),
      bytes,
      image: { base64: bytes.toString('base64'), mimeType: 'image/png', width, height },
    };
  });
}

const scoreColor = (score) =>
  score == null ? '#999' : score >= 70 ? '#0a7d33' : score >= 45 ? '#b57d00' : '#c22';

function elementRows(elements) {
  return elements
    .map((el) => {
      const swatch = `<span style="display:inline-block;width:0.7em;height:0.7em;border-radius:2px;background:${esc(el.hex)};margin-right:0.3em"></span>`;
      if (!el.found) {
        return `<div>${swatch}${esc(el.label)}: <em>${el.backgroundLike ? 'became background' : 'not found'}</em></div>`;
      }
      return `<div>${swatch}${esc(el.label)}: shift ${el.centroidShiftPct.toFixed(1)}% · scale ${el.scaleFactor.toFixed(2)}×</div>`;
    })
    .join('');
}

function buildReportHtml({ runId, labs, inputs, results }) {
  const cells = new Map(results.map((row) => [`${row.id}::${row.lab}::${row.sample}`, row]));
  const samples = Math.max(1, ...results.map((r) => r.sample));
  const header = labs
    .map((lab) => `<th>${esc(lab.label)}<div class="labkey">${esc(lab.key)}</div></th>`)
    .join('');
  const meanRow = labs
    .map((lab) => {
      const scores = results.filter((r) => r.lab === lab.key && r.layoutScore != null);
      const mean = scores.length
        ? scores.reduce((s, r) => s + r.layoutScore, 0) / scores.length
        : null;
      const cost = results.filter((r) => r.lab === lab.key).reduce((s, r) => s + (r.cost ?? 0), 0);
      return `<td style="color:${scoreColor(mean)}"><b>${mean == null ? '—' : mean.toFixed(1)}</b><div class="labkey">$${cost.toFixed(2)} total</div></td>`;
    })
    .join('');
  const bodyRows = inputs
    .map((input) => {
      const labCells = labs
        .map((lab) => {
          const sampleBlocks = [];
          for (let s = 1; s <= samples; s++) {
            const row = cells.get(`${input.id}::${lab.key}::${s}`);
            if (!row) continue;
            if (row.kind !== 'image') {
              sampleBlocks.push(
                `<div class="fail">${esc(row.kind)}: ${esc(row.reason ?? '')}</div>`
              );
              continue;
            }
            const g = row.score?.global;
            sampleBlocks.push(
              `<div class="cell"><img src="${esc(`assets/${row.thumbFile}`)}" loading="lazy">` +
                `<div class="score" style="color:${scoreColor(row.layoutScore)}">layout ${row.layoutScore ?? '—'}</div>` +
                (g
                  ? `<div class="diag">align ${g.informative === false ? 'saturated' : g.identityRatio.toFixed(2)} · best ${g.bestScale.toFixed(2)}× @ (${g.bestOffsetXPct.toFixed(0)}%, ${g.bestOffsetYPct.toFixed(0)}%)</div>`
                  : '') +
                `<details><summary>elements</summary>${elementRows(row.score?.elements ?? [])}</details></div>`
            );
          }
          return `<td>${sampleBlocks.join('') || '—'}</td>`;
        })
        .join('');
      return `<tr><td class="inputcell"><img src="${esc(`assets/in__${input.id}.jpg`)}" loading="lazy"><div>${esc(input.id)}</div></td>${labCells}</tr>`;
    })
    .join('');
  const promptList = labs
    .map(
      (lab) =>
        `<details><summary><b>${esc(lab.key)}</b> — ${esc(lab.label)}${
          Object.keys(lab.imageToolOverrides).length
            ? ` · tool ${esc(JSON.stringify(lab.imageToolOverrides))}`
            : ''
        }${lab.variant ? ` · model ${esc(lab.variant.label)}` : ''}</summary><p>${esc(lab.prompt)}</p></details>`
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>prompt adherence ${esc(runId)}</title>
<style>
body{font:14px system-ui;margin:1rem;background:#fafafa}
table{border-collapse:collapse}
td,th{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}
img{max-width:180px;display:block;border-radius:4px}
.labkey{font-weight:400;color:#888;font-size:11px}
.score{font-weight:700;margin-top:2px}
.diag{color:#666;font-size:11px}
.fail{color:#c22;max-width:180px}
.inputcell{background:#fff}
details{font-size:11px;color:#444;max-width:180px}
.cell{margin-bottom:8px}
</style>
<h1>Prompt-adherence lab — ${esc(runId)}</h1>
<p>Default model: ${esc(DEFAULT_VARIANT.label)} · scorer: tools/model-eval/lib/composition-score.mjs (higher layout = closer to the child's composition; align is identity-chamfer ÷ chance, lower = better; best names the drift transform)</p>
${promptList}
<table><tr><th>input</th>${header}</tr><tr><td><b>mean layout</b></td>${meanRow}</tr>${bodyRows}</table>`;
}

async function writeThumb(sourcePath, destPath) {
  await sharp(sourcePath)
    .resize(REPORT_THUMB_LONG_SIDE_PX, REPORT_THUMB_LONG_SIDE_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: REPORT_THUMB_JPEG_QUALITY })
    .toFile(destPath);
}

// The report is a self-contained folder (index.html + thumbnail assets) so a
// keeper run can be promoted verbatim with `npm run scrapbook:publish`.
async function buildReport({ runId, outDir, labs, inputs, results }) {
  const reportDir = join(outDir, 'report');
  const assetsDir = join(reportDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  for (const input of inputs) {
    await writeThumb(join(outDir, `in__${input.id}.png`), join(assetsDir, `in__${input.id}.jpg`));
  }
  for (const row of results) {
    if (row.kind !== 'image' || !row.outFile) continue;
    row.thumbFile = row.outFile.replace(/\.(png|jpg)$/, '.jpg');
    await writeThumb(join(outDir, row.outFile), join(assetsDir, row.thumbFile));
  }
  const htmlPath = join(reportDir, 'index.html');
  writeFileSync(htmlPath, buildReportHtml({ runId, labs, inputs, results }));
  return htmlPath;
}

// REPORT_FROM=<run dir>: rebuild report/ from that run's results.json and
// already-saved images, with no API calls.
async function reportOnly(dir) {
  const data = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
  const labKeys = [...new Set(data.results.map((row) => row.lab))];
  const labs = labKeys.map(
    (key) => data.labs.find((lab) => lab.key === key) ?? { key, label: key, imageToolOverrides: {} }
  );
  const inputIds = [...new Set(data.results.map((row) => row.id))];
  const inputs = inputIds.map((id) => ({ id }));
  const htmlPath = await buildReport({
    runId: data.runId,
    outDir: dir,
    labs,
    inputs,
    results: data.results,
  });
  console.log(`Report: ${pathToFileURL(htmlPath).href}`);
}

async function main() {
  if (process.env.REPORT_FROM) return reportOnly(process.env.REPORT_FROM);
  assertProductionConfig();
  requireEnv('OPENAI_API_KEY', 'set it in web/.env or export it');
  const labs = selectLabs();
  const inputs = loadInputs();
  const runId = makeRunId(process.env.OUT_TAG ?? 'adherence');
  const outDir = join(BASE, 'output', runId);
  mkdirSync(outDir, { recursive: true });
  for (const input of inputs) writeFileSync(join(outDir, `in__${input.id}.png`), input.bytes);

  const tasks = [];
  for (const input of inputs) {
    for (const lab of labs) {
      for (let sample = 1; sample <= SAMPLES; sample++) tasks.push({ input, lab, sample });
    }
  }
  console.log(
    `Run ${runId}\n  ${inputs.length} input(s) × ${labs.length} lab(s) × ${SAMPLES} sample(s) = ${tasks.length} call(s) · concurrency ${CONCURRENCY}\n`
  );

  const results = [];
  let done = 0;
  let spend = 0;
  const save = () =>
    writeFileSync(
      join(outDir, 'results.json'),
      JSON.stringify({ runId, model: DEFAULT_VARIANT.key, labs, results }, null, 2)
    );

  const thunks = tasks.map(({ input, lab, sample }) => async () => {
    const variant = lab.variant ?? DEFAULT_VARIANT;
    const result = await callVariant(variant, {
      apiKeys: { openai: process.env.OPENAI_API_KEY },
      image: input.image,
      prompt: lab.prompt,
      systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
      timeoutMs: CALL_TIMEOUT_MS,
      imageToolOverrides: lab.imageToolOverrides,
    });
    const row = {
      id: input.id,
      lab: lab.key,
      sample,
      kind: result.kind,
      ms: result.ms,
      reason: result.reason ?? null,
      revisedPrompt: result.revisedPrompt ?? null,
      cost: costOf(variant, result.usage),
      outFile: null,
      layoutScore: null,
      score: null,
    };
    if (result.kind === 'image') {
      const outBytes = Buffer.from(result.data, 'base64');
      row.outFile = `${input.id}__${lab.key}__${sample}.${imageFormat(outBytes) === 'jpeg' ? 'jpg' : 'png'}`;
      writeFileSync(join(outDir, row.outFile), outBytes);
      row.score = await scoreComposition({ inputBytes: input.bytes, outputBytes: outBytes });
      row.layoutScore = row.score.layoutScore;
    }
    results.push(row);
    spend += row.cost ?? 0;
    done++;
    console.log(
      `  [${done}/${tasks.length}] ${input.id} · ${lab.key} #${sample} → ${result.kind}` +
        (row.layoutScore != null ? ` layout=${row.layoutScore}` : '') +
        ` ${result.ms}ms${row.cost != null ? ` $${row.cost.toFixed(3)}` : ''} (total $${spend.toFixed(2)})`
    );
    save();
    return row;
  });

  await pool(thunks, CONCURRENCY);
  save();

  console.log('\n=== mean layout score per lab ===');
  for (const lab of labs) {
    const scores = results.filter((r) => r.lab === lab.key && r.layoutScore != null);
    const failed = results.filter((r) => r.lab === lab.key && r.kind !== 'image');
    const mean = scores.length
      ? (scores.reduce((s, r) => s + r.layoutScore, 0) / scores.length).toFixed(1)
      : '—';
    console.log(
      `  ${lab.key.padEnd(16)} ${mean.padStart(5)}  (${scores.length} scored${failed.length ? `, ${failed.length} failed` : ''})`
    );
  }

  const htmlPath = await buildReport({ runId, outDir, labs, inputs, results });
  save();
  console.log(`\nSpend: $${spend.toFixed(2)}\nReport: ${pathToFileURL(htmlPath).href}`);
}

await main();
