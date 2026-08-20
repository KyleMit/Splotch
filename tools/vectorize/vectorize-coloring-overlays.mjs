#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, run, runMain } from '../lib/proc.mjs';

const MAX_PRODUCTION_BATCH_SIZE = 12;
const OVERLAY_THEMES = {
  light: {
    sourceSuffix: 'outline',
    outputSuffix: 'overlay',
    rawDirectory: 'coloring-overlays',
    ledger: 'coloring-overlays.json',
  },
  dark: {
    sourceSuffix: 'chalk',
    outputSuffix: 'dark.overlay',
    rawDirectory: 'coloring-dark-overlays',
    ledger: 'coloring-dark-overlays.json',
    fill: '#fff',
  },
};
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

function overlayTheme(value = 'light') {
  if (!(value in OVERLAY_THEMES)) throw new Error('--theme must be light or dark');
  return value;
}

function ledgerPath(theme, root = ROOT) {
  return resolve(root, `tools/vectorize/${OVERLAY_THEMES[theme].ledger}`);
}

export function coloringOverlayJob(source, root = ROOT, theme = 'light') {
  const normalizedTheme = overlayTheme(theme);
  const config = OVERLAY_THEMES[normalizedTheme];
  const sourcePath = resolve(root, source);
  const sourceRelative = relative(root, sourcePath);
  const match = new RegExp(
    `^web/static/coloring/([^/]+)/(.+)\\.${config.sourceSuffix}\\.webp$`
  ).exec(sourceRelative);
  if (!match || match[2] === 'cover') {
    throw new Error(`Not a ${normalizedTheme} coloring-page outline: ${sourceRelative}`);
  }
  const [, book, stem] = match;
  return {
    book,
    stem,
    theme: normalizedTheme,
    source: sourceRelative,
    sourcePath,
    output: `web/static/coloring/${book}/${stem}.${config.outputSuffix}.svg`,
    outputPath: resolve(root, `web/static/coloring/${book}/${stem}.${config.outputSuffix}.svg`),
    raw: `vectorized/${config.rawDirectory}/${book}/${stem}.raw.svg`,
    rawPath: resolve(root, `vectorized/${config.rawDirectory}/${book}/${stem}.raw.svg`),
    fill: config.fill,
  };
}

export function coloringOverlayJobs(root = ROOT, theme = 'light') {
  const normalizedTheme = overlayTheme(theme);
  const sourceSuffix = OVERLAY_THEMES[normalizedTheme].sourceSuffix;
  return globSync(`web/static/coloring/**/*.${sourceSuffix}.webp`, { cwd: root })
    .filter((path) => !path.endsWith(`/cover.${sourceSuffix}.webp`))
    .map((path) => coloringOverlayJob(path, root, normalizedTheme))
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
      theme: { type: 'string' },
      'batch-size': { type: 'string' },
      production: { type: 'boolean' },
      force: { type: 'boolean' },
      check: { type: 'boolean' },
      'write-ledger': { type: 'boolean' },
    },
  });
  const batchSize = positiveBatchSize(values['batch-size']);
  const theme = overlayTheme(values.theme);
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
    theme,
    themeExplicit: values.theme !== undefined,
    batchSize,
    production: values.production ?? false,
    force: values.force ?? false,
    check: values.check ?? false,
    writeLedger: values['write-ledger'] ?? false,
  };
}

export function postprocessArgs(job) {
  const args = [
    resolve(ROOT, 'tools/vectorize/postprocess-svg.mjs'),
    job.rawPath,
    '--out',
    job.outputPath,
  ];
  if (job.fill) args.push('--fill', job.fill);
  return args;
}

function postprocess(job) {
  mkdirSync(dirname(job.outputPath), { recursive: true });
  run(process.execPath, postprocessArgs(job));
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

export function coloringOverlayLedger(jobs, { allowPartial = false } = {}) {
  const missing = jobs.filter((job) => !existsSync(job.outputPath));
  if (!allowPartial && missing.length > 0) {
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
    entries: jobs
      .filter((job) => existsSync(job.outputPath))
      .map((job) => ({
        source: job.source,
        sourceSha256: sha256(job.sourcePath),
        sourceBytes: readFileSync(job.sourcePath).byteLength,
        output: job.output,
        outputSha256: sha256(job.outputPath),
        outputBytes: readFileSync(job.outputPath).byteLength,
      })),
  };
}

export function checkColoringOverlayLedger(
  jobs,
  path = ledgerPath(jobs[0]?.theme ?? 'light'),
  { allowPartial = jobs[0]?.theme === 'dark' } = {}
) {
  if (!existsSync(path)) throw new Error(`Missing coloring overlay ledger: ${path}`);
  const ledger = JSON.parse(readFileSync(path, 'utf8'));
  if (ledger.formatVersion !== 1 || !Array.isArray(ledger.entries)) {
    throw new Error('Invalid coloring overlay ledger');
  }
  const expected = coloringOverlayLedger(jobs, { allowPartial });
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
  const jobs = coloringOverlayJobs(ROOT, options.theme);
  if (options.check) {
    const themes = options.themeExplicit
      ? [options.theme]
      : Object.keys(OVERLAY_THEMES).filter((theme) => existsSync(ledgerPath(theme)));
    for (const theme of themes) {
      const count = checkColoringOverlayLedger(coloringOverlayJobs(ROOT, theme));
      console.log(`[vectorize:coloring] checked ${count} ${theme} source/SVG derivation records.`);
    }
    return;
  }
  if (options.writeLedger) {
    const ledger = coloringOverlayLedger(jobs, { allowPartial: options.theme === 'dark' });
    writeFileSync(ledgerPath(options.theme), `${JSON.stringify(ledger, null, 2)}\n`);
    console.log(
      `[vectorize:coloring] wrote ${ledger.entries.length} ${options.theme} derivation records.`
    );
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
