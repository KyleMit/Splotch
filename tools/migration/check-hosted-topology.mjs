import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { verifyNetlifyRuntime } from '../lib/netlify-runtime.mjs';
import {
  PRODUCTION_INSTALL_CONTRACT,
  TOPOLOGY_INPUT_PATHS,
  assertHostedTopologyDeploy,
  assertHostedTopologyRecord,
} from './lib/netlify-topology-report.mjs';

const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function parseTopologyJson(bytes) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function checkHostedTopologyBytes(bytes, contractBytes, expectedCommit, metadata) {
  assert.ok(
    !bytes.toString('utf8').trimStart().startsWith('<'),
    'Hosted file is HTML, not a topology export'
  );
  const record = parseTopologyJson(bytes);
  const contract = parseTopologyJson(contractBytes);
  assertHostedTopologyRecord(record, contract, sha256(contractBytes));
  assertHostedTopologyDeploy(record, expectedCommit, metadata);
  return {
    disposition: 'hosted-topology-invariants-verified',
    commit: expectedCommit,
    deploy: record.deploy,
    bytes: bytes.length,
    sha256: sha256(bytes),
    contractSha256: sha256(contractBytes),
    installedPackageCount: record.inspection.installedPackageCount,
    resolutionCount: record.inspection.resolutions.length,
  };
}

export function runHostedTopologyCheck(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      artifact: { type: 'string' },
      commit: { type: 'string' },
      metadata: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  for (const name of ['artifact', 'commit', 'metadata'])
    assert.ok(values[name], `Missing --${name}`);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  }).trim();
  assert.equal(head, values.commit, 'Reader checkout differs from expected source');
  const committedBytes = (path) =>
    execFileSync('git', ['show', `${head}:${path}`], {
      cwd: ROOT,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
  const contractBytes = committedBytes(PRODUCTION_INSTALL_CONTRACT);
  const contract = parseTopologyJson(contractBytes);
  for (const [key, path] of Object.entries(TOPOLOGY_INPUT_PATHS)) {
    const committed = committedBytes(path);
    assert.equal(sha256(committed), contract[key], `Committed proof input changed: ${path}`);
    assert.deepEqual(
      readFileSync(join(ROOT, path)),
      committed,
      `Reader proof input changed: ${path}`
    );
  }
  const bytes = readFileSync(values.artifact);
  const metadata = JSON.parse(readFileSync(values.metadata, 'utf8'));
  const result = checkHostedTopologyBytes(bytes, contractBytes, values.commit, metadata);
  const inspection = parseTopologyJson(bytes).inspection;
  verifyNetlifyRuntime(ROOT, JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')), {
    nodeVersion: inspection.nodeVersion,
    packageManagerVersion: inspection.packageManagerVersion,
    env: { PNPM_FLAGS: inspection.productionFlags },
  });
  return result;
}

if (isMain(import.meta.url))
  runMain(async () => console.log(JSON.stringify(runHostedTopologyCheck(process.argv.slice(2)))));
