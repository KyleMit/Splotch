#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { IMAGE_REPORT_STORE_NAME } from '../web/src/lib/server/imageReportStoreName.ts';
import { isMain, ROOT, runId, runMain } from './lib/proc.mjs';

const PRODUCTION_DOMAIN = 'splotch.art';
const NETLIFY_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const REPORT_KEY_PATTERN =
  /^(\d+-[0-9a-f-]+)\/(input\.(?:jpg|png|webp)|metadata\.json|output\.(?:jpg|png|webp)|prompt\.txt)$/;
const CONTENT_TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function parseJson(label, value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`, { cause: error });
  }
}

export function resolveProductionSite(sites) {
  if (!Array.isArray(sites)) throw new Error('Netlify site listing was not an array');
  const matches = sites.filter(
    (site) =>
      site?.custom_domain === PRODUCTION_DOMAIN || site?.ssl_url === `https://${PRODUCTION_DOMAIN}`
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Netlify site for ${PRODUCTION_DOMAIN}; found ${matches.length}`
    );
  }
  const [site] = matches;
  if (typeof site.id !== 'string' || !site.id) {
    throw new Error(`Netlify site for ${PRODUCTION_DOMAIN} has no id`);
  }
  return { id: site.id, name: site.name ?? PRODUCTION_DOMAIN };
}

export function planReportBundles(listing) {
  if (!Array.isArray(listing?.blobs)) {
    throw new Error('Netlify blob listing did not contain a blobs array');
  }
  const reports = new Map();
  for (const blob of listing.blobs) {
    const match = typeof blob?.key === 'string' ? REPORT_KEY_PATTERN.exec(blob.key) : null;
    if (!match) throw new Error(`Unexpected ${IMAGE_REPORT_STORE_NAME} key: ${blob?.key}`);
    const [, reportId, filename] = match;
    const files = reports.get(reportId) ?? new Map();
    if (files.has(filename)) throw new Error(`Duplicate report blob: ${blob.key}`);
    files.set(filename, { key: blob.key, etag: blob.etag ?? null, filename });
    reports.set(reportId, files);
  }

  const bundles = [];
  const failures = [];
  for (const [reportId, files] of reports) {
    const filenames = [...files.keys()];
    const inputs = filenames.filter((filename) => filename.startsWith('input.'));
    const outputs = filenames.filter((filename) => filename.startsWith('output.'));
    const missing = ['metadata.json', 'prompt.txt'].filter((filename) => !files.has(filename));
    const problems = [];
    if (inputs.length !== 1) problems.push('expected one input image');
    if (outputs.length !== 1) problems.push('expected one output image');
    if (missing.length) problems.push(`missing ${missing.join(', ')}`);
    if (problems.length) {
      failures.push({ reportId, error: problems.join('; ') });
      continue;
    }
    bundles.push({
      reportId,
      input: files.get(inputs[0]),
      output: files.get(outputs[0]),
      files: [...files.values()].sort((a, b) => a.filename.localeCompare(b.filename)),
    });
  }
  return {
    bundles: bundles.sort((a, b) => a.reportId.localeCompare(b.reportId)),
    failures: failures.sort((a, b) => a.reportId.localeCompare(b.reportId)),
  };
}

function assertDownloadedFile(path, key) {
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`${key} downloaded as an empty or missing file`);
  }
}

function extensionOf(filename) {
  return filename.slice(filename.lastIndexOf('.') + 1);
}

function readMetadata(reportDir, bundle) {
  const metadata = parseJson(
    `${bundle.reportId}/metadata.json`,
    readFileSync(join(reportDir, 'metadata.json'), 'utf8')
  );
  if (
    metadata?.version !== 1 ||
    typeof metadata.reportedAt !== 'string' ||
    typeof metadata.deleteAfter !== 'string'
  ) {
    throw new Error(`${bundle.reportId}/metadata.json has an unsupported shape`);
  }
  const expectedInputType = CONTENT_TYPE_BY_EXTENSION[extensionOf(bundle.input.filename)];
  const expectedOutputType = CONTENT_TYPE_BY_EXTENSION[extensionOf(bundle.output.filename)];
  if (metadata.inputContentType !== expectedInputType) {
    throw new Error(`${bundle.reportId}: input filename and content type disagree`);
  }
  if (metadata.outputContentType !== expectedOutputType) {
    throw new Error(`${bundle.reportId}: output filename and content type disagree`);
  }
  return metadata;
}

function styleSlug(style) {
  const slug = String(style ?? 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'default';
}

export function modelEvalInputFilename(reportId, style) {
  return `report__${reportId}-${styleSlug(style)}__production.png`;
}

function copyModelEvalInput(source, destination) {
  if (!existsSync(destination)) {
    copyFileSync(source, destination);
    return 'copied';
  }
  if (!readFileSync(source).equals(readFileSync(destination))) {
    return 'conflict';
  }
  return 'unchanged';
}

function runNetlify(args, { cwd = ROOT, env = process.env } = {}) {
  const result = spawnSync('netlify', args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: NETLIFY_MAX_BUFFER_BYTES,
  });
  if (result.error) throw new Error(`Could not launch Netlify CLI: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || 'unknown error';
    throw new Error(`Netlify CLI failed: ${detail}`);
  }
  return result.stdout ?? '';
}

export function fetchImageReports({
  root = ROOT,
  snapshotId = runId(),
  command = runNetlify,
  importEvalInputs = false,
} = {}) {
  const sites = parseJson('netlify sites:list', command(['sites:list', '--json'], { cwd: root }));
  const site = resolveProductionSite(sites);
  const netlifyEnv = { ...process.env, NETLIFY_SITE_ID: site.id };
  const listing = parseJson(
    `netlify blobs:list ${IMAGE_REPORT_STORE_NAME}`,
    command(['blobs:list', IMAGE_REPORT_STORE_NAME, '--json'], {
      cwd: root,
      env: netlifyEnv,
    })
  );
  const plan = planReportBundles(listing);
  const snapshotDir = join(root, '.eval-tmp', 'ai-image-reports', snapshotId);
  if (existsSync(snapshotDir)) throw new Error(`Snapshot already exists: ${snapshotDir}`);
  mkdirSync(snapshotDir, { recursive: true });

  const evalInputsDir = join(root, 'tools', 'model-eval', 'inputs');
  if (importEvalInputs) mkdirSync(evalInputsDir, { recursive: true });
  const reports = [];
  const failures = [...plan.failures];

  for (const bundle of plan.bundles) {
    const reportDir = join(snapshotDir, bundle.reportId);
    mkdirSync(reportDir);
    try {
      for (const file of bundle.files) {
        const destination = join(reportDir, file.filename);
        command(['blobs:get', IMAGE_REPORT_STORE_NAME, file.key, '--output', destination], {
          cwd: root,
          env: netlifyEnv,
        });
        assertDownloadedFile(destination, file.key);
      }
      const metadata = readMetadata(reportDir, bundle);
      let evalInput = null;
      let evalInputStatus = 'not-requested';
      if (importEvalInputs && extensionOf(bundle.input.filename) === 'png') {
        evalInput = join(evalInputsDir, modelEvalInputFilename(bundle.reportId, metadata.style));
        evalInputStatus = copyModelEvalInput(join(reportDir, bundle.input.filename), evalInput);
      } else if (importEvalInputs) {
        evalInputStatus = 'unsupported';
      }
      reports.push({
        reportId: bundle.reportId,
        metadata,
        files: bundle.files.map(({ key, etag, filename }) => ({ key, etag, filename })),
        evalInput: evalInput ? relative(root, evalInput) : null,
        evalInputStatus,
      });
    } catch (error) {
      failures.push({ reportId: bundle.reportId, error: error.message });
    }
  }

  const manifest = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    site: { ...site, domain: PRODUCTION_DOMAIN },
    store: IMAGE_REPORT_STORE_NAME,
    reports,
    failures,
  };
  writeFileSync(join(snapshotDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (failures.length) {
    throw new Error(
      `Fetched ${reports.length} report(s) to ${relative(root, snapshotDir)}, but ${failures.length} failed:\n` +
        failures.map(({ reportId, error }) => `${reportId}: ${error}`).join('\n')
    );
  }
  const conflicts = reports.filter(({ evalInputStatus }) => evalInputStatus === 'conflict');
  if (conflicts.length) {
    throw new Error(
      `Fetched ${reports.length} report(s) to ${relative(root, snapshotDir)}, but ${conflicts.length} model-eval input conflict(s) require review:\n` +
        conflicts.map(({ reportId, evalInput }) => `${reportId}: ${evalInput}`).join('\n')
    );
  }
  return { site, snapshotDir, reports };
}

function printFetchImageReportsHelp() {
  console.log(`Fetch retained production AI image reports for local review.

Usage:
  npm run fetch:image-reports [-- --import-eval-inputs]

The command discovers the Netlify site serving ${PRODUCTION_DOMAIN}, reads the
${IMAGE_REPORT_STORE_NAME} store, and writes a timestamped snapshot beneath
.eval-tmp/ai-image-reports/. The default is snapshot-only. Pass
--import-eval-inputs to copy PNG drawings into the gitignored model-eval corpus,
then select them with:

  FILTER=report__ npm run model-eval

Model evaluation A/B-tests the reported drawing with its base prompt; it does
not replay the resolved style prompt retained in the snapshot's prompt.txt.

Requires an installed, authenticated Netlify CLI. Production is read-only.`);
}

export async function runFetchImageReports() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      'import-eval-inputs': { type: 'boolean' },
    },
    strict: true,
  });
  if (values.help) return printFetchImageReportsHelp();

  const importEvalInputs = values['import-eval-inputs'] ?? false;
  const result = fetchImageReports({ importEvalInputs });
  const copied = result.reports.filter(
    ({ evalInputStatus }) => evalInputStatus === 'copied'
  ).length;
  const unchanged = result.reports.filter(
    ({ evalInputStatus }) => evalInputStatus === 'unchanged'
  ).length;
  const skipped = result.reports.filter(
    ({ evalInputStatus }) => evalInputStatus === 'unsupported'
  ).length;
  console.log(`[fetch:image-reports] site: ${result.site.name} (${PRODUCTION_DOMAIN})`);
  console.log(
    `[fetch:image-reports] fetched ${result.reports.length} report(s) to ${relative(ROOT, result.snapshotDir)}`
  );
  if (!importEvalInputs) {
    console.log('[fetch:image-reports] model-eval input import not requested');
  } else {
    console.log(
      `[fetch:image-reports] model-eval inputs: ${copied} copied, ${unchanged} unchanged, ${skipped} skipped`
    );
  }
  if (importEvalInputs && result.reports.length) {
    console.log('[fetch:image-reports] run: FILTER=report__ npm run model-eval');
  }
}

if (isMain(import.meta.url)) runMain(runFetchImageReports);
