#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { IMAGE_REPORT_RETENTION_DAYS } from '../web/src/lib/imageReport.ts';
import { IMAGE_REPORT_STORE_NAME } from '../web/src/lib/server/imageReportStoreName.ts';
import { isMain, ROOT, runId, runMain } from './lib/proc.mjs';

const PRODUCTION_DOMAIN = 'splotch.art';
const NETLIFY_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_RETENTION_MS = IMAGE_REPORT_RETENTION_DAYS * DAY_MS;

// Deliberately a local literal rather than an import of the store's version: the number names the
// metadata shape describeMetadataProblem validates, so a store bump must fail this tool's store
// round-trip test until the reader is taught the new shape.
export const READABLE_METADATA_VERSION = 2;

const REPORT_KEY_PATTERN =
  /^(\d+-[0-9a-f-]+)\/(input\.(?:jpg|png|webp)|metadata\.json|output\.(?:jpg|png|webp)|prompt\.txt)$/;
const REPORT_DIRECTORY_PATTERN = /^(\d+)-[0-9a-f-]+$/;
const EVAL_INPUT_REPORT_PATTERN = /^report__(\d+)-[0-9a-f-]+-[a-z0-9-]+__production\.png$/;
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
    if (outputs.length > 1) problems.push('expected at most one output image');
    if (missing.length) problems.push(`missing ${missing.join(', ')}`);
    if (problems.length) {
      failures.push({ reportId, error: problems.join('; ') });
      continue;
    }
    bundles.push({
      reportId,
      input: files.get(inputs[0]),
      output: outputs.length ? files.get(outputs[0]) : null,
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

const BUNDLE_PROBLEM_BY_KIND = {
  picture(metadata, bundle) {
    if (!bundle.output) return 'picture report has no output image';
    if (
      metadata.outputContentType !== CONTENT_TYPE_BY_EXTENSION[extensionOf(bundle.output.filename)]
    ) {
      return 'output filename and content type disagree';
    }
    if (metadata.refusalReason !== null) return 'picture report carries a refusal reason';
    return null;
  },
  'false-positive-refusal'(metadata, bundle) {
    if (bundle.output) return 'refusal report has an output image';
    if (metadata.outputContentType !== null) return 'refusal report names an output content type';
    if (typeof metadata.refusalReason !== 'string') return 'refusal report has no refusal reason';
    return null;
  },
};
// Keyed locally rather than by the store's AI_REPORT_KINDS: a kind added there must fail this tool's
// kind drift test until it gets bundle rules, instead of falling into another kind's rules.
export const READABLE_REPORT_KINDS = Object.keys(BUNDLE_PROBLEM_BY_KIND);

function describeMetadataProblem(metadata, bundle) {
  if (metadata?.version !== READABLE_METADATA_VERSION) {
    return `unsupported metadata version ${JSON.stringify(metadata?.version)} (this tool reads version ${READABLE_METADATA_VERSION})`;
  }
  if (!Object.hasOwn(BUNDLE_PROBLEM_BY_KIND, metadata.kind)) {
    return `unsupported report kind ${JSON.stringify(metadata.kind)}`;
  }
  if (typeof metadata.reportedAt !== 'string' || typeof metadata.deleteAfter !== 'string') {
    return 'metadata is missing reportedAt or deleteAfter';
  }
  if (metadata.style !== null && typeof metadata.style !== 'string') {
    return 'metadata style is neither a string nor null';
  }
  if (metadata.inputContentType !== CONTENT_TYPE_BY_EXTENSION[extensionOf(bundle.input.filename)]) {
    return 'input filename and content type disagree';
  }
  return BUNDLE_PROBLEM_BY_KIND[metadata.kind](metadata, bundle);
}

function readMetadata(reportDir, bundle) {
  const metadata = parseJson(
    `${bundle.reportId}/metadata.json`,
    readFileSync(join(reportDir, 'metadata.json'), 'utf8')
  );
  const problem = describeMetadataProblem(metadata, bundle);
  if (problem) throw new Error(`${bundle.reportId}/metadata.json: ${problem}`);
  return metadata;
}

function reportTimestampIsExpired(timestamp, now) {
  return Number(timestamp) <= now - REPORT_RETENTION_MS;
}

export function isReportExpired(reportId, now) {
  const match = REPORT_DIRECTORY_PATTERN.exec(reportId);
  return Boolean(match) && reportTimestampIsExpired(match[1], now);
}

function childEntries(directory) {
  return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : [];
}

const MANIFEST_REPORT_LISTS = ['reports', 'failures', 'expired'];

function pruneManifest(manifestPath, now) {
  if (!existsSync(manifestPath)) return { retainsReports: false };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { retainsReports: true };
  }
  let retainedEntries = 0;
  let changed = false;
  const pruned = { ...manifest };
  for (const list of MANIFEST_REPORT_LISTS) {
    if (!Array.isArray(manifest?.[list])) continue;
    pruned[list] = manifest[list].filter((entry) => !isReportExpired(entry?.reportId, now));
    retainedEntries += pruned[list].length;
    changed ||= pruned[list].length !== manifest[list].length;
  }
  if (changed) writeFileSync(manifestPath, `${JSON.stringify(pruned, null, 2)}\n`);
  return { retainsReports: retainedEntries > 0 };
}

function pruneSnapshot(snapshotDir, now) {
  let removedReports = 0;
  for (const entry of childEntries(snapshotDir)) {
    if (!entry.isDirectory() || !isReportExpired(entry.name, now)) continue;
    rmSync(join(snapshotDir, entry.name), { recursive: true, force: true });
    removedReports++;
  }
  const { retainsReports } = pruneManifest(join(snapshotDir, 'manifest.json'), now);
  const remaining = childEntries(snapshotDir).filter(({ name }) => name !== 'manifest.json');
  const removedSnapshot = !retainsReports && !remaining.length;
  if (removedSnapshot) rmSync(snapshotDir, { recursive: true, force: true });
  return { removedReports, removedSnapshot };
}

export function pruneExpiredLocalReports({ root = ROOT, now = Date.now() } = {}) {
  const result = { reports: 0, snapshots: 0, evalInputs: 0 };
  const snapshotsDir = join(root, '.eval-tmp', 'ai-image-reports');
  for (const entry of childEntries(snapshotsDir)) {
    if (!entry.isDirectory()) continue;
    const { removedReports, removedSnapshot } = pruneSnapshot(join(snapshotsDir, entry.name), now);
    result.reports += removedReports;
    if (removedSnapshot) result.snapshots++;
  }
  const evalInputsDir = join(root, 'tools', 'model-eval', 'inputs');
  for (const entry of childEntries(evalInputsDir)) {
    const match = entry.isFile() ? EVAL_INPUT_REPORT_PATTERN.exec(entry.name) : null;
    if (!match || !reportTimestampIsExpired(match[1], now)) continue;
    rmSync(join(evalInputsDir, entry.name), { force: true });
    result.evalInputs++;
  }
  return result;
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
  now = Date.now(),
} = {}) {
  const pruned = pruneExpiredLocalReports({ root, now });
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
  const expired = [...plan.bundles, ...plan.failures]
    .map(({ reportId }) => reportId)
    .filter((reportId) => isReportExpired(reportId, now))
    .sort();
  const retainedBundles = plan.bundles.filter(({ reportId }) => !isReportExpired(reportId, now));
  const failures = plan.failures.filter(({ reportId }) => !isReportExpired(reportId, now));
  const snapshotDir = join(root, '.eval-tmp', 'ai-image-reports', snapshotId);
  if (existsSync(snapshotDir)) throw new Error(`Snapshot already exists: ${snapshotDir}`);
  mkdirSync(snapshotDir, { recursive: true });

  const evalInputsDir = join(root, 'tools', 'model-eval', 'inputs');
  if (importEvalInputs) mkdirSync(evalInputsDir, { recursive: true });
  const reports = [];

  for (const bundle of retainedBundles) {
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
    expired: expired.map((reportId) => ({ reportId })),
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
  return { site, snapshotDir, reports, expired: manifest.expired, pruned };
}

function printFetchImageReportsHelp() {
  console.log(`Fetch retained production AI image reports for local review.

Usage:
  npm run fetch:image-reports [-- --import-eval-inputs]

The command discovers the Netlify site serving ${PRODUCTION_DOMAIN}, reads the
${IMAGE_REPORT_STORE_NAME} store, and writes a timestamped snapshot beneath
.eval-tmp/ai-image-reports/. The default is snapshot-only.

Every run first deletes local copies of reports older than the
${IMAGE_REPORT_RETENTION_DAYS}-day retention window: report folders in earlier
snapshots and report__ drawings in tools/model-eval/inputs/. Reports the
production purge has not yet deleted are listed as expired, never downloaded. Pass
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
  console.log(
    `[fetch:image-reports] pruned past-retention local copies: ${result.pruned.reports} report folder(s), ${result.pruned.snapshots} snapshot(s), ${result.pruned.evalInputs} model-eval input(s)`
  );
  console.log(`[fetch:image-reports] site: ${result.site.name} (${PRODUCTION_DOMAIN})`);
  if (result.expired.length) {
    console.log(
      `[fetch:image-reports] skipped ${result.expired.length} past-retention report(s) the production purge has not deleted yet`
    );
  }
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
