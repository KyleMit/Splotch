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
  TOPOLOGY_PUBLIC_PATH,
  assertHostedTopologyDeploy,
  assertHostedTopologyRecord,
} from './lib/netlify-topology-report.mjs';

const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function parseTopologyJson(bytes) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function assertHostedTopologyTransport(transport, bytes, metadata) {
  assert.ok(
    transport !== null && typeof transport === 'object' && !Array.isArray(transport),
    'Hosted transport receipt is missing'
  );
  assert.deepEqual(
    Object.keys(transport).sort(),
    ['url', 'status', 'contentType', 'bytes', 'sha256'].sort(),
    'Hosted transport fields differ'
  );
  assert.equal(typeof transport.url, 'string', 'Hosted transport URL is missing');
  const url = new URL(transport.url);
  assert.match(
    url.hostname,
    new RegExp(`^${metadata.id}--[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.netlify\\.app$`),
    'Hosted transport URL differs from the immutable deploy'
  );
  assert.equal(
    transport.url,
    `https://${url.hostname}${TOPOLOGY_PUBLIC_PATH}`,
    'Hosted transport URL differs from the immutable deploy'
  );
  assert.equal(transport.status, 200, 'Hosted transport status differs');
  assert.equal(typeof transport.contentType, 'string', 'Hosted transport content type is missing');
  assert.equal(
    transport.contentType.split(';', 1)[0].trim().toLowerCase(),
    'application/json',
    'Hosted transport content type differs'
  );
  assert.equal(transport.bytes, bytes.length, 'Hosted transport byte count differs');
  assert.equal(transport.sha256, sha256(bytes), 'Hosted transport bytes differ');
}

export function checkHostedTopologyBytes(
  bytes,
  contractBytes,
  expectedCommit,
  metadata,
  transport
) {
  assert.ok(
    !bytes.toString('utf8').trimStart().startsWith('<'),
    'Hosted file is HTML, not a topology export'
  );
  const record = parseTopologyJson(bytes);
  const contract = parseTopologyJson(contractBytes);
  assertHostedTopologyRecord(record, contract, sha256(contractBytes));
  assertHostedTopologyDeploy(record, expectedCommit, metadata);
  assertHostedTopologyTransport(transport, bytes, metadata);
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
      transport: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  for (const name of ['artifact', 'commit', 'metadata', 'transport'])
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
  const transport = parseTopologyJson(readFileSync(values.transport));
  const result = checkHostedTopologyBytes(bytes, contractBytes, values.commit, metadata, transport);
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
