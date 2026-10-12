import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { isMain, runMain } from '../lib/proc.mjs';
import { changedArtifacts, readLockFile } from './lib/lock-artifacts.mjs';
import { inspectRegistryArtifact } from './lib/archive-inventory.mjs';

const INSPECTION_WORKERS = 4;

export async function generateScriptInventory(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      baseline: { type: 'string' },
      output: { type: 'string' },
      lock: { type: 'string', default: 'pnpm-lock.yaml' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.baseline || !values.output) throw new Error('Require --baseline and --output');
  const artifacts = changedArtifacts(
    readLockFile(resolve(values.baseline)),
    readLockFile(resolve(values.lock))
  );
  const rows = new Array(artifacts.length);
  let next = 0;
  async function inspectNext() {
    while (next < artifacts.length) {
      const index = next++;
      rows[index] = await inspectRegistryArtifact(artifacts[index]);
      process.stderr.write(
        `${index + 1}/${artifacts.length}: ${artifacts[index].key} ${rows[index].disposition}\n`
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(INSPECTION_WORKERS, artifacts.length) }, inspectNext)
  );
  const report = {
    schemaVersion: 1,
    scope: 'all added/changed lock package artifacts, all platforms',
    baselineLockSha256: createHash('sha256')
      .update(readFileSync(resolve(values.baseline)))
      .digest('hex'),
    candidateLockSha256: createHash('sha256')
      .update(readFileSync(resolve(values.lock)))
      .digest('hex'),
    selectedArtifacts: artifacts.map((artifact) => ({
      key: artifact.key,
      integrity: artifact.integrity,
    })),
    inspectedArtifacts: rows.length,
    inspectionWorkers: INSPECTION_WORKERS,
    complete: rows.length === artifacts.length,
    rows,
  };
  writeFileSync(resolve(values.output), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (isMain(import.meta.url)) runMain(() => generateScriptInventory(process.argv.slice(2)));
