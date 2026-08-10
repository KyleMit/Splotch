import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import {
  expectedCritiqueBatches,
  finalizeDesignCritique,
  readCaptureManifest,
  StaleCritiqueHashError,
  validateCritiqueEntries,
} from './lib/page-inventory-data.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const CHECKPOINT_SCHEMA_VERSION = 1;
const MANIFEST_DEFAULT = join(ROOT, 'scrapbook/page-inventory/capture-manifest.json');
const CHECKPOINTS_DEFAULT = join(ROOT, '.scrapbook-scratch/page-inventory-critique/checkpoints');
const OUT_DEFAULT = join(ROOT, 'scrapbook/page-inventory/design-critique.json');
const SCRAPBOOK_ROOT = resolve(ROOT, 'scrapbook');

function options(argv) {
  const values = parseArgs({
    args: argv,
    options: {
      manifest: { type: 'string', default: MANIFEST_DEFAULT },
      checkpoints: { type: 'string', default: CHECKPOINTS_DEFAULT },
      out: { type: 'string', default: OUT_DEFAULT },
      'allow-partial': { type: 'boolean', default: false },
      status: { type: 'boolean', default: false },
    },
    strict: true,
  }).values;
  const out = resolve(ROOT, values.out);
  if (
    values['allow-partial'] &&
    (out === SCRAPBOOK_ROOT || out.startsWith(`${SCRAPBOOK_ROOT}${sep}`))
  ) {
    throw new Error('--allow-partial requires an explicit scratch --out path');
  }
  return {
    manifest: resolve(ROOT, values.manifest),
    checkpoints: resolve(ROOT, values.checkpoints),
    out,
    allowPartial: values['allow-partial'],
    status: values.status,
  };
}

function readCheckpoint(path) {
  let document;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`could not parse JSON: ${error.message}`, { cause: error });
  }
  if (document?.schema_version !== CHECKPOINT_SCHEMA_VERSION) {
    throw new Error(`schema_version must be ${CHECKPOINT_SCHEMA_VERSION}`);
  }
  if (typeof document.batch_key !== 'string' || !document.batch_key) {
    throw new Error('batch_key must be a string');
  }
  if (!Array.isArray(document.entries)) throw new Error('entries must be an array');
  return document;
}

function validateCheckpoint(document, manifest, expectedBatches) {
  const expected = expectedBatches.get(document.batch_key);
  if (!expected) throw new Error(`unknown batch_key ${document.batch_key}`);
  const entries = validateCritiqueEntries(document.entries, manifest, { allowPartial: true });
  if (entries.size !== expected.length) {
    throw new Error(`batch has ${entries.size} of ${expected.length} required entries`);
  }
  for (const capture of expected) {
    if (!entries.has(capture.image)) throw new Error(`batch is missing ${capture.image}`);
  }
  return [...entries.values()];
}

function checkpointWithCurrentHashes(document, manifest) {
  const captures = new Map(manifest.captures.map((capture) => [capture.image, capture]));
  return {
    ...document,
    entries: document.entries.map((entry) => {
      const capture = captures.get(entry?.image);
      return capture ? { ...entry, sha256: capture.sha256 } : entry;
    }),
  };
}

function loadCheckpointEntries(
  checkpoints,
  manifest,
  { allowPartial = false, reportStatus = false } = {}
) {
  if (!existsSync(checkpoints))
    throw new Error(`Checkpoint directory does not exist: ${checkpoints}`);
  const expectedBatches = expectedCritiqueBatches(manifest);
  const files = readdirSync(checkpoints)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));
  const errors = [];
  const encounteredBatches = new Set();
  const seenBatches = new Set();
  const staleBatches = new Set();
  const entries = [];
  for (const file of files) {
    let document;
    try {
      document = readCheckpoint(join(checkpoints, file));
      if (encounteredBatches.has(document.batch_key)) {
        throw new Error(`duplicate batch_key ${document.batch_key}`);
      }
      encounteredBatches.add(document.batch_key);
      const batchEntries = validateCheckpoint(document, manifest, expectedBatches);
      seenBatches.add(document.batch_key);
      entries.push(...batchEntries);
    } catch (error) {
      if (reportStatus && document && error instanceof StaleCritiqueHashError) {
        try {
          validateCheckpoint(
            checkpointWithCurrentHashes(document, manifest),
            manifest,
            expectedBatches
          );
          staleBatches.add(document.batch_key);
          continue;
        } catch (normalizedError) {
          errors.push(`${file}: ${normalizedError.message}`);
          continue;
        }
      }
      errors.push(`${file}: ${error.message}`);
    }
  }
  if (errors.length) {
    throw new Error(
      `Invalid critique checkpoints:\n${errors.map((error) => `- ${error}`).join('\n')}`
    );
  }
  if (!allowPartial && seenBatches.size !== expectedBatches.size) {
    const missing = [...expectedBatches.keys()].find((key) => !seenBatches.has(key));
    throw new Error(
      `Critique has ${seenBatches.size} of ${expectedBatches.size} batches; missing ${missing}`
    );
  }
  return {
    entries,
    completedBatchKeys: seenBatches,
    staleBatchKeys: staleBatches,
    completedBatches: seenBatches.size,
    expectedBatches: expectedBatches.size,
  };
}

function writeJsonAtomically(path, document) {
  mkdirSync(dirname(path), { recursive: true });
  const staging = mkdtempSync(join(dirname(path), `.${basename(path)}-staging-`));
  const candidate = join(staging, basename(path));
  try {
    writeFileSync(candidate, `${JSON.stringify(document, null, 2)}\n`);
    renameSync(candidate, path);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export async function finalizePageInventoryCritique(argv = process.argv.slice(2)) {
  const { manifest: manifestPath, checkpoints, out, allowPartial, status } = options(argv);
  const manifest = readCaptureManifest(manifestPath);
  if (status) mkdirSync(checkpoints, { recursive: true });
  const loaded = loadCheckpointEntries(checkpoints, manifest, {
    allowPartial: status || allowPartial,
    reportStatus: status,
  });
  if (status) {
    const missing = [...expectedCritiqueBatches(manifest).keys()].filter(
      (key) => !loaded.completedBatchKeys.has(key) && !loaded.staleBatchKeys.has(key)
    );
    console.log(
      JSON.stringify(
        {
          completed_batches: loaded.completedBatches,
          expected_batches: loaded.expectedBatches,
          missing_batches: missing,
          stale_batches: [...loaded.staleBatchKeys],
        },
        null,
        2
      )
    );
    return;
  }
  const critique = finalizeDesignCritique(manifest, loaded.entries, { allowPartial });
  writeJsonAtomically(out, critique);
  console.log(
    `Finalized ${loaded.completedBatches} of ${loaded.expectedBatches} batches and ${critique.entries.length} entries to ${relative(ROOT, out)}`
  );
}

if (isMain(import.meta.url)) runMain(finalizePageInventoryCritique);
