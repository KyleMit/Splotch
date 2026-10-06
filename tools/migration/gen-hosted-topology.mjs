import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { runNetlifyTopologyWitness, topologyProofContext } from '../netlify-topology-witness.mjs';
import {
  PRODUCTION_INSTALL_CONTRACT,
  TOPOLOGY_EXPORT_PATH,
  createHostedTopologyRecord,
} from './lib/netlify-topology-report.mjs';

const EXPORT_FILE_MODE = 0o644;

export function writeHostedTopologyFile(root, record) {
  const output = join(root, TOPOLOGY_EXPORT_PATH);
  assert.equal(
    realpathSync(dirname(output)),
    dirname(output),
    'Publish directory cannot be an alias'
  );
  const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  const descriptor = openSync(output, 'wx', EXPORT_FILE_MODE);
  try {
    const stat = fstatSync(descriptor);
    assert.ok(stat.isFile() && stat.nlink === 1, 'Topology export must be a single regular file');
    assert.equal(stat.mode & 0o777, EXPORT_FILE_MODE, 'Topology export mode differs');
    writeFileSync(descriptor, bytes);
    assert.deepEqual(readFileSync(output), bytes, 'Topology export readback differs');
  } finally {
    closeSync(descriptor);
  }
  return {
    disposition: 'complete-topology-export-written',
    path: TOPOLOGY_EXPORT_PATH,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    commit: record.inspection.commit,
    deploy: record.deploy,
    installedPackageCount: record.inspection.installedPackageCount,
  };
}

export function runHostedTopologyExport() {
  if (!topologyProofContext(process.env)) return { disposition: 'not-the-selected-proof-ref' };
  assert.notEqual(process.env.CAPACITOR, 'true', 'Topology export requires the web publish build');
  assert.notEqual(process.env.PERF_MARKS, 'true', 'Topology export requires the shipping build');
  const inspection = runNetlifyTopologyWitness();
  const bytes = readFileSync(join(ROOT, PRODUCTION_INSTALL_CONTRACT));
  const contract = JSON.parse(bytes.toString('utf8'));
  const contractSha256 = createHash('sha256').update(bytes).digest('hex');
  return writeHostedTopologyFile(
    ROOT,
    createHostedTopologyRecord(inspection, contract, contractSha256, process.env)
  );
}

if (isMain(import.meta.url))
  runMain(async () => {
    assert.deepEqual(process.argv.slice(2), [], 'Hosted topology export takes no arguments');
    console.log(JSON.stringify(runHostedTopologyExport()));
  });
