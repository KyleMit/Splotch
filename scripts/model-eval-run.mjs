#!/usr/bin/env node
// Image-model evaluation runner. A/B-compares the two candidate production image
// models against the corpus in web/tests/model-eval/inputs/ using the EXACT
// production request config, and persists a self-contained side-by-side report
// (quality gallery + cost + latency + safety) to web/tests/model-eval/output/<runId>/.
//
// MANUAL, real-token tool — NOT part of `npm test`. Requires GEMINI_API_KEY.
//
//   npm run model-eval                 # full corpus, 1 sample per model
//   FILTER=coloring npm run model-eval # only inputs whose id matches
//   SAMPLES=3 FILTER=art-detail__cat npm run model-eval   # variance probe
//
// Env: SAMPLES (default 1), FILTER (id substring), CONCURRENCY (default 1 — keep
// at 1 for clean latency numbers), OUT_TAG (suffix on the run dir), SKIP_REPORT.

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT,
  MODELS,
  CHROMIUM_PATH,
  DEFAULT_PROMPT,
  SAFETY_SYSTEM_INSTRUCTION,
  assertProductionConfig,
  safetySettings,
  classify,
  costOf,
  imageOutputTokens,
  imageDims,
  imageFormat,
} from './lib/model-eval.mjs';
import { buildReport } from './lib/model-eval-report.mjs';

const BASE = join(ROOT, 'web/tests/model-eval');
const IN = join(BASE, 'inputs');
const SAMPLES = Number(process.env.SAMPLES ?? 1);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1);
const FILTER = process.env.FILTER || '';
// RESUME=<existing run dir>: fill only the cells that don't already have an image
// (failed/missing), merging into that dir's results.json. Never re-runs a cell that
// already produced an image, so existing outputs are preserved as-is.
const RESUME = process.env.RESUME || '';
// A fixed, filesystem-safe run id. Date.now() is fine in plain Node; kept simple.
const runId =
  new Date().toISOString().replace(/[:.]/g, '-') +
  (process.env.OUT_TAG ? `-${process.env.OUT_TAG}` : '');
const OUT = join(BASE, 'output', runId);

const SAFETY = safetySettings(HarmCategory, HarmBlockThreshold);

function categoryOf(id) {
  return id.split('__')[0];
}

async function callOnce(ai, model, image) {
  const started = performance.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            { text: DEFAULT_PROMPT },
          ],
        },
      ],
      config: {
        abortSignal: AbortSignal.timeout(120_000),
        systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
        safetySettings: SAFETY,
      },
    });
    const ms = Math.round(performance.now() - started);
    const c = classify(response);
    return {
      ms,
      ...c,
      usage: response.usageMetadata ?? null,
      finishReason: response?.candidates?.[0]?.finishReason ?? null,
    };
  } catch (err) {
    return {
      ms: Math.round(performance.now() - started),
      kind: 'error',
      reason: (err?.message || String(err)).split('\n')[0],
      usage: null,
    };
  }
}

// Run an array of async thunks with a small concurrency cap.
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

// Rebuild report.html from an existing run's results.json, with no API calls.
//   REPORT_FROM=web/tests/model-eval/output/<runId> [VERDICT_FILE=verdict.html] npm run model-eval
async function reportOnly(dir) {
  const data = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
  const verdictHtml = process.env.VERDICT_FILE
    ? readFileSync(process.env.VERDICT_FILE, 'utf8')
    : undefined;
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  try {
    const htmlPath = await buildReport({
      runId: data.runId,
      outDir: dir,
      inputsDir: IN,
      results: data.results,
      samples: data.samples ?? 1,
      browser,
      verdictHtml,
    });
    console.log(`Report: ${pathToFileURL(htmlPath).href}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.env.REPORT_FROM) return reportOnly(process.env.REPORT_FROM);
  assertProductionConfig();
  console.log('✓ prompt + system instruction match the app source');
  if (!process.env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY (set it in .env or export it).');
    process.exit(1);
  }
  if (!existsSync(IN)) {
    console.error(`No inputs at ${IN}. Run: npm run model-eval:fixtures`);
    process.exit(1);
  }
  const inputs = readdirSync(IN)
    .filter((f) => f.endsWith('.png') && f.includes(FILTER))
    .sort();
  if (!inputs.length) {
    console.error(`No inputs matched FILTER="${FILTER}".`);
    process.exit(1);
  }
  // Resume: reuse the given dir + its runId, keep every cell that already has an
  // image on disk, and only run the missing/failed ones.
  const outDir = RESUME || OUT;
  let effRunId = runId;
  let effSamples = SAMPLES;
  const results = [];
  const doneCells = new Set();
  if (RESUME) {
    const prev = JSON.parse(readFileSync(join(outDir, 'results.json'), 'utf8'));
    effRunId = prev.runId;
    effSamples = prev.samples ?? SAMPLES;
    for (const r of prev.results) {
      if (r.kind === 'image' && r.outFile && existsSync(join(outDir, r.outFile))) {
        results.push(r);
        doneCells.add(`${r.id}::${r.model}::${r.sample}`);
      }
    }
    console.log(`Resuming ${effRunId}: ${doneCells.size} existing images kept, filling the rest.`);
  }
  mkdirSync(outDir, { recursive: true });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Build the flat task list, skipping cells already satisfied on a resume.
  const tasks = [];
  for (const file of inputs) {
    const id = file.replace(/\.png$/, '');
    const bytes = readFileSync(join(IN, file));
    const image = { base64: bytes.toString('base64'), mimeType: 'image/png' };
    for (const model of MODELS) {
      for (let s = 1; s <= effSamples; s++) {
        if (doneCells.has(`${id}::${model.id}::${s}`)) continue;
        tasks.push({ id, file, image, model, s });
      }
    }
  }

  console.log(
    `Run ${effRunId}\n  ${tasks.length} call(s) to make${RESUME ? ` (${doneCells.size} kept)` : ''} · concurrency ${CONCURRENCY}\n`
  );

  const save = () =>
    writeFileSync(
      join(outDir, 'results.json'),
      JSON.stringify({ runId: effRunId, samples: effSamples, results }, null, 2)
    );
  let done = 0;
  const thunks = tasks.map((t) => async () => {
    const r = await callOnce(ai, t.model.id, t.image);
    let outFile = null,
      outSize = null,
      outBytes = null,
      outFmt = null;
    if (r.kind === 'image') {
      const ob = Buffer.from(r.data, 'base64');
      outFile = `${t.id}__${t.model.id}__${t.s}.${imageFormat(ob) === 'jpeg' ? 'jpg' : 'png'}`;
      writeFileSync(join(outDir, outFile), ob);
      outSize = imageDims(ob);
      outBytes = ob.length;
      outFmt = imageFormat(ob);
    }
    const row = {
      id: t.id,
      category: categoryOf(t.id),
      model: t.model.id,
      modelLabel: t.model.label,
      sample: t.s,
      kind: r.kind,
      ms: r.ms,
      reason: r.reason ?? null,
      finishReason: r.finishReason ?? null,
      promptTokens: r.usage?.promptTokenCount ?? null,
      candidateTokens: r.usage?.candidatesTokenCount ?? null,
      imageTokens: imageOutputTokens(r.usage),
      totalTokens: r.usage?.totalTokenCount ?? null,
      cost: costOf(t.model.id, r.usage),
      outFile,
      outFmt,
      outSize,
      outBytes,
    };
    results.push(row);
    done++;
    console.log(
      `  [${done}/${tasks.length}] ${t.id} · ${t.model.label} #${t.s} → ${r.kind} ${r.ms}ms ${row.imageTokens ?? ''}tok`
    );
    save();
    return row;
  });

  await pool(thunks, CONCURRENCY);
  save();

  const refusals = results.filter((r) => r.kind === 'refusal');
  const errors = results.filter((r) => r.kind === 'error');
  console.log(
    `\nDone. ${results.length} calls · ${refusals.length} refusals · ${errors.length} errors`
  );

  if (!process.env.SKIP_REPORT) {
    const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
    try {
      const htmlPath = await buildReport({
        runId: effRunId,
        outDir,
        inputsDir: IN,
        verdictHtml: process.env.VERDICT_FILE
          ? readFileSync(process.env.VERDICT_FILE, 'utf8')
          : undefined,
        results,
        samples: effSamples,
        browser,
      });
      console.log(`\nReport: ${pathToFileURL(htmlPath).href}`);
    } finally {
      await browser.close();
    }
  }
}

await main();
