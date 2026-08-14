#!/usr/bin/env node
// Image-model evaluation runner. Compares every candidate production variant —
// provider × model × effort tier — against the corpus in tools/model-eval/inputs/
// using the EXACT production request config, and persists a self-contained
// side-by-side report (quality gallery + cost + latency + safety) to
// tools/model-eval/output/<runId>/.
//
// MANUAL, real-token tool — NOT part of `npm test`. Requires GEMINI_API_KEY and
// OPENAI_API_KEY (only the providers actually selected are required).
//
//   npm run model-eval                    # full corpus, every variant, 1 sample
//   FILTER=coloring npm run model-eval    # only inputs whose id matches
//   VARIANTS=gpt-image-2 npm run model-eval          # only matching variants
//   SAMPLES=3 FILTER=art-detail__cat npm run model-eval   # variance probe
//
// Env: SAMPLES (default 1), FILTER (input id substring), VARIANTS (variant key
// substring), PER_CATEGORY (cap inputs per category — the high-effort tiers are
// expensive), CONCURRENCY (default 1 — raise it to finish sooner, at the cost of
// latency numbers measured under load), OUT_TAG (suffix on the run dir),
// SKIP_REPORT.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT,
  VARIANTS,
  DEFAULT_PROMPT,
  SAFETY_SYSTEM_INSTRUCTION,
  assertProductionConfig,
  categoryOf,
  costOf,
  imageDims,
  imageFormat,
  takePerCategory,
} from './lib/model-eval.mjs';
import { callVariant } from './lib/image-providers.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { requireEnv, runId as makeRunId } from '../lib/proc.mjs';
import { buildReport } from './lib/model-eval-report.mjs';

const BASE = join(ROOT, 'tools/model-eval');
const IN = join(BASE, 'inputs');
const SAMPLES = Number(process.env.SAMPLES ?? 1);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1);
const FILTER = process.env.FILTER || '';
const VARIANT_FILTER = process.env.VARIANTS || '';
// Cap the corpus per category rather than overall: the high-effort tiers cost
// real money per cell, and an overall cap would spend the whole budget on
// whichever categories sort first.
const PER_CATEGORY = Number(process.env.PER_CATEGORY ?? 0);
// Generous enough for the slowest tier measured on this corpus (gpt-image-2 at
// high effort runs past two and a half minutes), so a deadline never masquerades
// as a model failure in the report.
const CALL_TIMEOUT_MS = 300_000;
// RESUME=<existing run dir>: fill only the cells that don't already have an image
// (failed/missing), merging into that dir's results.json. Never re-runs a cell that
// already produced an image, so existing outputs are preserved as-is.
const RESUME = process.env.RESUME || '';
// A fixed, filesystem-safe run id. Date.now() is fine in plain Node; kept simple.
const runId = makeRunId(process.env.OUT_TAG);
const OUT = join(BASE, 'output', runId);

const PROVIDER_KEY_ENV = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY' };

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

// Rebuild report/index.html from an existing run's results.json, with no API calls.
//   REPORT_FROM=tools/model-eval/output/<runId> [VERDICT_FILE=verdict.html] npm run model-eval
async function reportOnly(dir) {
  const data = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
  const verdictHtml = process.env.VERDICT_FILE
    ? readFileSync(process.env.VERDICT_FILE, 'utf8')
    : undefined;
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  try {
    const htmlPath = await buildReport({
      runId: data.runId,
      outDir: dir,
      inputsDir: IN,
      results: data.results,
      samples: data.samples ?? 1,
      concurrency: data.concurrency ?? 1,
      variants: data.variants ?? VARIANTS,
      browser,
      verdictHtml,
    });
    console.log(`Report: ${pathToFileURL(htmlPath).href}`);
  } finally {
    await browser.close();
  }
}

function selectVariants() {
  const selected = VARIANTS.filter(
    (variant) => !VARIANT_FILTER || variant.key.includes(VARIANT_FILTER)
  );
  if (!selected.length) {
    console.error(
      `No variants matched VARIANTS="${VARIANT_FILTER}".\nAvailable keys:\n  ${VARIANTS.map((v) => v.key).join('\n  ')}`
    );
    process.exit(1);
  }
  for (const provider of new Set(selected.map((variant) => variant.provider))) {
    requireEnv(PROVIDER_KEY_ENV[provider], 'set it in web/.env or export it');
  }
  return selected;
}

// Every input is loaded once and shared across variants, so the corpus is read
// from disk N times rather than N × variants times.
function loadInputs() {
  if (!existsSync(IN)) {
    console.error(`No inputs at ${IN}. Run: npm run model-eval:fixtures`);
    process.exit(1);
  }
  const files = readdirSync(IN)
    .filter((file) => file.endsWith('.png') && file.includes(FILTER))
    .sort();
  if (!files.length) {
    console.error(`No inputs matched FILTER="${FILTER}".`);
    process.exit(1);
  }
  const capped = PER_CATEGORY > 0 ? takePerCategory(files, PER_CATEGORY) : files;
  if (capped.length < files.length) {
    console.log(
      `PER_CATEGORY=${PER_CATEGORY}: using ${capped.length} of ${files.length} inputs, balanced across categories.`
    );
  }
  return capped.map((file) => {
    const bytes = readFileSync(join(IN, file));
    const [width, height] = (imageDims(bytes) ?? '0x0').split('x').map(Number);
    return {
      id: file.replace(/\.png$/, ''),
      image: { base64: bytes.toString('base64'), mimeType: 'image/png', width, height },
    };
  });
}

const cellKey = (row) => `${row.id}::${row.variant}::${row.sample}`;

// Cells already satisfied by a previous run of the same dir, so a resume can
// skip them without re-paying. Only an image counts as *done* — refusals and
// errors are re-called, because those are exactly the cells a resume exists to
// retry.
//
// Every previous row is carried forward regardless, because save() rewrites
// results.json wholesale: dropping the non-image rows here would make a resume
// under a narrower FILTER permanently delete the refusal and error rows that a
// safety reading is counted off, and it would look like a clean run.
function loadResume(outDir) {
  const previous = JSON.parse(readFileSync(join(outDir, 'results.json'), 'utf8'));
  const done = previous.results.filter(
    (row) => row.kind === 'image' && row.outFile && existsSync(join(outDir, row.outFile))
  );
  return {
    runId: previous.runId,
    samples: previous.samples ?? SAMPLES,
    results: previous.results,
    doneCells: new Set(done.map(cellKey)),
  };
}

function resultRow(task, result, outFile, outBytes) {
  return {
    id: task.id,
    category: categoryOf(task.id),
    variant: task.variant.key,
    variantLabel: task.variant.label,
    provider: task.variant.provider,
    model: task.variant.model,
    quality: task.variant.quality,
    sample: task.sample,
    kind: result.kind,
    ms: result.ms,
    reason: result.reason ?? null,
    finishReason: result.finishReason ?? null,
    revisedPrompt: result.revisedPrompt ?? null,
    usage: result.usage ?? null,
    imageTokens: result.usage?.imageOutTokens ?? null,
    cost: costOf(task.variant, result.usage),
    outFile,
    outFmt: outBytes ? imageFormat(outBytes) : null,
    outSize: outBytes ? imageDims(outBytes) : null,
    outBytes: outBytes?.length ?? null,
  };
}

async function main() {
  if (process.env.REPORT_FROM) return reportOnly(process.env.REPORT_FROM);
  assertProductionConfig();
  console.log('✓ prompt + system instruction match the app source');

  const variants = selectVariants();
  const inputs = loadInputs();

  const outDir = RESUME || OUT;
  const resumed = RESUME ? loadResume(outDir) : null;
  const effRunId = resumed?.runId ?? runId;
  const effSamples = resumed?.samples ?? SAMPLES;
  const results = resumed ? [...resumed.results] : [];
  const doneCells = resumed?.doneCells ?? new Set();
  if (resumed) {
    console.log(`Resuming ${effRunId}: ${doneCells.size} existing images kept, filling the rest.`);
  }
  mkdirSync(outDir, { recursive: true });

  const apiKeys = {
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };

  const tasks = [];
  for (const input of inputs) {
    for (const variant of variants) {
      for (let sample = 1; sample <= effSamples; sample++) {
        if (doneCells.has(`${input.id}::${variant.key}::${sample}`)) continue;
        tasks.push({ ...input, variant, sample });
      }
    }
  }

  console.log(
    `Run ${effRunId}\n  ${inputs.length} input(s) × ${variants.length} variant(s) × ${effSamples} sample(s)` +
      `\n  ${tasks.length} call(s) to make${resumed ? ` (${doneCells.size} kept)` : ''} · concurrency ${CONCURRENCY}\n`
  );

  const save = () =>
    writeFileSync(
      join(outDir, 'results.json'),
      JSON.stringify(
        { runId: effRunId, samples: effSamples, concurrency: CONCURRENCY, variants, results },
        null,
        2
      )
    );

  let done = 0;
  const thunks = tasks.map((task) => async () => {
    const result = await callVariant(task.variant, {
      apiKeys,
      image: task.image,
      prompt: DEFAULT_PROMPT,
      systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
      timeoutMs: CALL_TIMEOUT_MS,
    });

    let outFile = null;
    let outBytes = null;
    if (result.kind === 'image') {
      outBytes = Buffer.from(result.data, 'base64');
      const ext = imageFormat(outBytes) === 'jpeg' ? 'jpg' : 'png';
      outFile = `${task.id}__${task.variant.key}__${task.sample}.${ext}`;
      writeFileSync(join(outDir, outFile), outBytes);
    }

    const row = resultRow(task, result, outFile, outBytes);
    // A re-called cell replaces its previous row rather than joining it, so a
    // resumed run never reports one cell twice.
    const previousIndex = results.findIndex((existing) => cellKey(existing) === cellKey(row));
    if (previousIndex === -1) results.push(row);
    else results[previousIndex] = row;
    done++;
    console.log(
      `  [${done}/${tasks.length}] ${task.id} · ${task.variant.label} #${task.sample} → ` +
        `${result.kind} ${result.ms}ms ${row.imageTokens ?? ''}tok ${row.cost != null ? '$' + row.cost.toFixed(4) : ''}`
    );
    save();
    return row;
  });

  await pool(thunks, CONCURRENCY);
  save();

  const refusals = results.filter((row) => row.kind === 'refusal');
  const errors = results.filter((row) => row.kind === 'error');
  const spend = results.reduce((total, row) => total + (row.cost ?? 0), 0);
  console.log(
    `\nDone. ${results.length} calls · ${refusals.length} refusals · ${errors.length} errors · $${spend.toFixed(2)} spent`
  );

  if (!process.env.SKIP_REPORT) {
    const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
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
        concurrency: CONCURRENCY,
        variants,
        browser,
      });
      console.log(`\nReport: ${pathToFileURL(htmlPath).href}`);
    } finally {
      await browser.close();
    }
  }
}

await main();
