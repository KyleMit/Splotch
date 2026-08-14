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
// MANUAL, real-token tool — NOT part of `npm test`. Requires OPENAI_API_KEY.
//
//   npm run model-eval:adherence                    # focus corpus × every lab
//   FILTER=toysword npm run model-eval:adherence    # one input
//   LABS=baseline,fidelity npm run model-eval:adherence
//   SAMPLES=2 CONCURRENCY=4 npm run model-eval:adherence
//
// Env: FILTER (input id substring), LABS (lab key substring, comma-separated),
// SAMPLES (default 1), CONCURRENCY (default 4), OUT_TAG (run-dir suffix),
// INPUTS (comma-separated input ids to replace the focus corpus).

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
import { callVariant } from './lib/image-providers.mjs';
import { scoreComposition } from './lib/composition-score.mjs';
import { esc } from '../lib/html.mjs';
import { requireEnv, runId as makeRunId } from '../lib/proc.mjs';

const BASE = join(ROOT, 'tools/model-eval');
const IN = join(BASE, 'inputs');
const SAMPLES = Number(process.env.SAMPLES ?? 1);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const FILTER = process.env.FILTER || '';
const LAB_FILTER = (process.env.LABS || '').split(',').filter(Boolean);
const CALL_TIMEOUT_MS = 300_000;

// The lab pins the cheapest candidate tier — it is the one that drifts, and
// the one production picked (web/src/lib/server/ai/openai.ts).
const MODEL_VARIANT = VARIANTS.find((v) => v.key === 'gpt-image-2-low');

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

// The sentence block each composition-preserving candidate appends or weaves
// in. Kept as named constants so results.json rows stay traceable to exact
// prompt text across runs.
const LAYOUT_LOCK_SUFFIX =
  ' Keep the composition exactly as the child placed it: every element stays at its own position and its own size relative to the frame. Do not enlarge the main subject, do not zoom in, and do not move things to the center. If the child drew elements apart from each other, keep them apart — do not attach, merge, or regroup them. Areas the child left empty stay open and airy; do not fill them with new objects or scenery.';

const OVERLAY_PROMPT =
  "Paint directly over this child's drawing so the finished picture lines up with the original: every shape stays exactly where the child drew it, at exactly the size the child drew it. Polish each drawn shape in place into a warm, whimsical illustration — vibrant color, charming details, soft light — without moving, enlarging, shrinking, or rearranging anything, and without zooming in or cropping. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Areas the child left empty stay open — do not add objects the child did not draw.";

export const LABS = [
  { key: 'baseline', label: 'production prompt', prompt: DEFAULT_PROMPT, imageToolOverrides: {} },
  {
    key: 'layout-lock',
    label: 'prod + layout-lock suffix',
    prompt: DEFAULT_PROMPT + LAYOUT_LOCK_SUFFIX,
    imageToolOverrides: {},
  },
  {
    key: 'overlay',
    label: 'overlay rewrite',
    prompt: OVERLAY_PROMPT,
    imageToolOverrides: {},
  },
  {
    key: 'fidelity-high',
    label: 'prod + input_fidelity high',
    prompt: DEFAULT_PROMPT,
    imageToolOverrides: { input_fidelity: 'high' },
  },
  {
    key: 'lock-fidelity',
    label: 'layout-lock + input_fidelity high',
    prompt: DEFAULT_PROMPT + LAYOUT_LOCK_SUFFIX,
    imageToolOverrides: { input_fidelity: 'high' },
  },
];

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
  const selected = LABS.filter(
    (lab) => !LAB_FILTER.length || LAB_FILTER.some((f) => lab.key.includes(f))
  );
  if (!selected.length) {
    console.error(
      `No labs matched LABS="${process.env.LABS}". Keys: ${LABS.map((l) => l.key).join(', ')}`
    );
    process.exit(1);
  }
  return selected;
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
              `<div class="cell"><img src="${esc(row.outFile)}" loading="lazy">` +
                `<div class="score" style="color:${scoreColor(row.layoutScore)}">layout ${row.layoutScore ?? '—'}</div>` +
                (g
                  ? `<div class="diag">align ${g.identityRatio.toFixed(2)} · best ${g.bestScale.toFixed(2)}× @ (${g.bestOffsetXPct.toFixed(0)}%, ${g.bestOffsetYPct.toFixed(0)}%)</div>`
                  : '') +
                `<details><summary>elements</summary>${elementRows(row.score?.elements ?? [])}</details></div>`
            );
          }
          return `<td>${sampleBlocks.join('') || '—'}</td>`;
        })
        .join('');
      return `<tr><td class="inputcell"><img src="${esc(`in__${input.id}.png`)}" loading="lazy"><div>${esc(input.id)}</div></td>${labCells}</tr>`;
    })
    .join('');
  const promptList = labs
    .map(
      (lab) =>
        `<details><summary><b>${esc(lab.key)}</b> — ${esc(lab.label)}${
          Object.keys(lab.imageToolOverrides).length
            ? ` · tool ${esc(JSON.stringify(lab.imageToolOverrides))}`
            : ''
        }</summary><p>${esc(lab.prompt)}</p></details>`
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
<p>Model: ${esc(MODEL_VARIANT.label)} · scorer: lib/composition-score.mjs (higher layout = closer to the child's composition; align is identity-chamfer ÷ chance, lower = better; best names the drift transform)</p>
${promptList}
<table><tr><th>input</th>${header}</tr><tr><td><b>mean layout</b></td>${meanRow}</tr>${bodyRows}</table>`;
}

async function main() {
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
      JSON.stringify({ runId, model: MODEL_VARIANT.key, labs, results }, null, 2)
    );

  const thunks = tasks.map(({ input, lab, sample }) => async () => {
    const result = await callVariant(MODEL_VARIANT, {
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
      cost: costOf(MODEL_VARIANT, result.usage),
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

  const html = buildReportHtml({ runId, labs, inputs, results });
  const htmlPath = join(outDir, 'report.html');
  writeFileSync(htmlPath, html);
  console.log(`\nSpend: $${spend.toFixed(2)}\nReport: ${pathToFileURL(htmlPath).href}`);
}

await main();
