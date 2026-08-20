#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, run, runMain } from '../lib/proc.mjs';

const LEDGER_PATH = resolve(ROOT, 'tools/vectorize/coloring-overlays.json');
const MAX_PRODUCTION_BATCH_SIZE = 12;
const KEEPER_PARAMS = [
  ['processing.max_colors', '2'],
  ['processing.palette', '#000000 ~ 0.05; #FFFFFF -> #00000000 ~ 0.05;'],
  ['output.gap_filler.enabled', 'false'],
  ['output.shape_stacking', 'stacked'],
  ['output.group_by', 'none'],
];

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function coloringOverlayJob(source, root = ROOT) {
  const sourcePath = resolve(root, source);
  const sourceRelative = relative(root, sourcePath);
  const match = /^web\/static\/coloring\/([^/]+)\/(.+)\.outline\.webp$/.exec(sourceRelative);
  if (!match || match[2] === 'cover') {
    throw new Error(`Not a coloring-page outline: ${sourceRelative}`);
  }
  const [, book, stem] = match;
  return {
    book,
    stem,
    source: sourceRelative,
    sourcePath,
    output: `web/static/coloring/${book}/${stem}.overlay.svg`,
    outputPath: resolve(root, `web/static/coloring/${book}/${stem}.overlay.svg`),
    raw: `vectorized/coloring-overlays/${book}/${stem}.raw.svg`,
    rawPath: resolve(root, `vectorized/coloring-overlays/${book}/${stem}.raw.svg`),
  };
}

export function coloringOverlayJobs(root = ROOT) {
  return globSync('web/static/coloring/**/*.outline.webp', { cwd: root })
    .filter((path) => !path.endsWith('/cover.outline.webp'))
    .map((path) => coloringOverlayJob(path, root))
    .sort((a, b) => a.source.localeCompare(b.source));
}

export function jobState(job, force = false) {
  if (force) return 'trace';
  if (existsSync(job.outputPath)) return 'done';
  if (existsSync(job.rawPath)) return 'postprocess';
  return 'trace';
}

export function selectColoringOverlayJobs(
  jobs,
  { book, match, batchSize = Number.POSITIVE_INFINITY, force = false } = {}
) {
  return jobs
    .filter((job) => (!book || job.book === book) && (!match || job.source.includes(match)))
    .map((job) => ({ ...job, state: jobState(job, force) }))
    .filter((job) => job.state !== 'done')
    .slice(0, batchSize);
}

function positiveBatchSize(value) {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('--batch-size must be a positive integer');
  }
  return parsed;
}

export function parseColoringOverlayArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      book: { type: 'string' },
      match: { type: 'string' },
      'batch-size': { type: 'string' },
      production: { type: 'boolean' },
      force: { type: 'boolean' },
      check: { type: 'boolean' },
      'write-ledger': { type: 'boolean' },
    },
  });
  const batchSize = positiveBatchSize(values['batch-size']);
  const modes = [values.production, values.check, values['write-ledger']].filter(Boolean).length;
  if (modes > 1) throw new Error('Choose only one of --production, --check, or --write-ledger');
  if (values.production) {
    if (!values.book && !values.match) {
      throw new Error('--production requires --book or --match to bound the paid payload');
    }
    if (!batchSize) throw new Error('--production requires an explicit --batch-size');
    if (batchSize > MAX_PRODUCTION_BATCH_SIZE) {
      throw new Error(`--batch-size cannot exceed ${MAX_PRODUCTION_BATCH_SIZE} production traces`);
    }
  }
  if (values.force && !values.production) throw new Error('--force requires --production');
  return {
    book: values.book,
    match: values.match,
    batchSize,
    production: values.production ?? false,
    force: values.force ?? false,
    check: values.check ?? false,
    writeLedger: values['write-ledger'] ?? false,
  };
}

function postprocess(job) {
  mkdirSync(dirname(job.outputPath), { recursive: true });
  run(process.execPath, [
    resolve(ROOT, 'tools/vectorize/postprocess-svg.mjs'),
    job.rawPath,
    '--out',
    job.outputPath,
  ]);
}

function trace(job) {
  mkdirSync(dirname(job.rawPath), { recursive: true });
  const params = KEEPER_PARAMS.flatMap(([name, value]) => ['--param', `${name}=${value}`]);
  run(process.execPath, [
    resolve(ROOT, 'tools/vectorize/vectorize-image.mjs'),
    job.sourcePath,
    '--out',
    job.rawPath,
    '--production',
    ...params,
  ]);
  postprocess(job);
}

export function coloringOverlayLedger(jobs) {
  const missing = jobs.filter((job) => !existsSync(job.outputPath));
  if (missing.length > 0) {
    throw new Error(
      `Cannot write a complete ledger; ${missing.length} overlay(s) are missing:\n${missing
        .slice(0, 12)
        .map((job) => job.output)
        .join('\n')}`
    );
  }
  return {
    formatVersion: 1,
    recipe: Object.fromEntries(KEEPER_PARAMS),
    entries: jobs.map((job) => ({
      source: job.source,
      sourceSha256: sha256(job.sourcePath),
      sourceBytes: readFileSync(job.sourcePath).byteLength,
      output: job.output,
      outputSha256: sha256(job.outputPath),
      outputBytes: readFileSync(job.outputPath).byteLength,
    })),
  };
}

export function checkColoringOverlayLedger(jobs, ledgerPath = LEDGER_PATH) {
  if (!existsSync(ledgerPath)) throw new Error(`Missing coloring overlay ledger: ${ledgerPath}`);
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  if (ledger.formatVersion !== 1 || !Array.isArray(ledger.entries)) {
    throw new Error('Invalid coloring overlay ledger');
  }
  const expected = coloringOverlayLedger(jobs);
  if (JSON.stringify(ledger) !== JSON.stringify(expected)) {
    throw new Error(
      'Coloring outline/SVG derivation drifted; regenerate the affected production trace and run --write-ledger'
    );
  }
  return expected.entries.length;
}

function printPlan(jobs) {
  const traceCount = jobs.filter((job) => job.state === 'trace').length;
  const recoveryCount = jobs.length - traceCount;
  console.log(
    `[vectorize:coloring] ${jobs.length} pending: ${traceCount} paid trace(s), ${recoveryCount} raw recovery post-process(es)`
  );
  for (const job of jobs) console.log(`${job.state.padEnd(11)} ${job.source} -> ${job.output}`);
}

export async function runColoringOverlayCampaign(argv = process.argv.slice(2)) {
  const options = parseColoringOverlayArgs(argv);
  const jobs = coloringOverlayJobs();
  if (options.check) {
    const count = checkColoringOverlayLedger(jobs);
    console.log(`[vectorize:coloring] checked ${count} source/SVG derivation records.`);
    return;
  }
  if (options.writeLedger) {
    const ledger = coloringOverlayLedger(jobs);
    writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
    console.log(`[vectorize:coloring] wrote ${ledger.entries.length} derivation records.`);
    return;
  }

  const selected = selectColoringOverlayJobs(jobs, {
    ...options,
    batchSize: options.batchSize,
  });
  printPlan(selected);
  if (!options.production || selected.length === 0) return;

  for (const job of selected) {
    if (job.state === 'postprocess') postprocess(job);
    else trace(job);
  }
  console.log(`[vectorize:coloring] completed ${selected.length} overlay(s).`);
}

if (isMain(import.meta.url)) runMain(() => runColoringOverlayCampaign());
