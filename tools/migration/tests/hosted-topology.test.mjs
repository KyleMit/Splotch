import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { inspectNetlifyProductionInstall } from '../../netlify-topology-witness.mjs';
import { checkHostedTopologyBytes } from '../check-hosted-topology.mjs';
import { writeHostedTopologyFile } from '../gen-hosted-topology.mjs';
import {
  TOPOLOGY_EXPORT_PATH,
  TOPOLOGY_INPUT_PATHS,
  TOPOLOGY_PROOF_BRANCH,
  createHostedTopologyRecord,
  assertTopologyGraph,
} from '../lib/netlify-topology-report.mjs';

const CLI_TIMEOUT_MS = 30_000;
const EXPORT_FILE_MODE = 0o644;
const RESTRICTIVE_UMASKS = [0o027, 0o077];
const roots = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (value) => Buffer.from(JSON.stringify(value));
const artifact = (name, version) => ({ key: `${name}@${version}`, name, version });

function transportReceipt(body, metadata) {
  return {
    url: `https://${metadata.id}--splotch.netlify.app/migration-install-topology.json`,
    status: 200,
    contentType: 'application/json; charset=utf-8',
    bytes: body.length,
    sha256: hash(body),
  };
}

function put(root, path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof value === 'string' ? value : bytes(value));
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-hosted-topology-')));
  roots.push(root);
  put(root, 'package.json', {
    packageManager: 'pnpm@11.22.0',
    engines: { node: '>=22.13.0' },
    dependencies: { required: '2.0.0' },
  });
  put(root, `${CANDIDATE_DIRECTORY}/package.json`, {
    name: '@splotch/native-architecture',
    private: true,
  });
  put(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  put(root, 'pnpm-workspace.yaml', 'nodeLinker: hoisted\n');
  put(root, 'netlify.toml', '[build.environment]\nNODE_VERSION = "22"\nPNPM_FLAGS = "--prod"\n');
  put(root, 'node_modules/required/package.json', { name: 'required', version: '2.0.0' });
  put(root, 'node_modules/required/node_modules/shared/package.json', {
    name: 'shared',
    version: '1.0.0',
  });
  for (const path of ['web/build', 'netlify/functions', 'tools'])
    mkdirSync(join(root, path), { recursive: true });
  const contract = {
    schemaVersion: 1,
    candidateDirectory: CANDIDATE_DIRECTORY,
    packageManager: 'pnpm@11.22.0',
    ...Object.fromEntries(
      Object.entries(TOPOLOGY_INPUT_PATHS).map(([key, path]) => [
        key,
        hash(readFileSync(join(root, path))),
      ])
    ),
    productionArtifacts: [artifact('required', '2.0.0'), artifact('shared', '1.0.0')],
    productionDirect: [artifact('required', '2.0.0')],
    candidateExclusiveArtifacts: [artifact('expo', '57.0.26')],
  };
  const commit = '1'.repeat(40);
  const env = {
    NETLIFY: 'true',
    CONTEXT: 'branch-deploy',
    BRANCH: TOPOLOGY_PROOF_BRANCH,
    COMMIT_REF: commit,
    PNPM_FLAGS: '--prod',
    DEPLOY_ID: '2'.repeat(24),
    BUILD_ID: '3'.repeat(24),
    SITE_ID: '44444444-4444-4444-4444-444444444444',
    SECRET_TOKEN: 'never-export-this-value',
  };
  const inspection = inspectNetlifyProductionInstall(root, contract, {
    headSha: commit,
    nodeVersion: 'v22.23.2',
    packageManagerVersion: '11.22.0',
    env,
  });
  const contractBytes = bytes(contract);
  const record = createHostedTopologyRecord(inspection, contract, hash(contractBytes), env);
  const metadata = {
    id: env.DEPLOY_ID,
    build_id: env.BUILD_ID,
    site_id: env.SITE_ID,
    commit_ref: commit,
    branch: env.BRANCH,
    context: env.CONTEXT,
    state: 'ready',
  };
  const transport = transportReceipt(bytes(record), metadata);
  const check = (value = record, selected = metadata, receipt = transport) =>
    checkHostedTopologyBytes(bytes(value), contractBytes, commit, selected, receipt);
  return { root, contract, contractBytes, record, metadata, transport, check };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Complete hosted topology export', () => {
  it('round-trips the real physical production observer through complete published bytes', () => {
    const { root, record, check } = fixture();
    const receipt = writeHostedTopologyFile(root, record);
    const body = readFileSync(join(root, TOPOLOGY_EXPORT_PATH));
    expect(JSON.parse(body.toString())).toEqual(record);
    expect(receipt.sha256).toBe(hash(body));
    expect(check()).toMatchObject({
      disposition: 'hosted-topology-invariants-verified',
      installedPackageCount: 2,
      resolutionCount: 5,
    });
    expect(body.toString()).not.toContain('never-export-this-value');
    expect(record.inspection.packageManagerVersion).toBe('11.22.0');
    for (const key of Object.keys(TOPOLOGY_INPUT_PATHS))
      expect(record.inspection[key]).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(RESTRICTIVE_UMASKS)('writes the published mode under restrictive umask %i', (mask) => {
    const { root, record } = fixture();
    const previous = process.umask(mask);
    try {
      writeHostedTopologyFile(root, record);
      expect(statSync(join(root, TOPOLOGY_EXPORT_PATH)).mode & 0o777).toBe(EXPORT_FILE_MODE);
      expect(JSON.parse(readFileSync(join(root, TOPOLOGY_EXPORT_PATH), 'utf8'))).toEqual(record);
    } finally {
      process.umask(previous);
    }
  });

  it.each([
    ['missing receipt', () => undefined, 'Hosted transport receipt is missing'],
    ['fields', (t) => ({ ...t, extra: 'not-selected' }), 'Hosted transport fields differ'],
    [
      'wrong deploy',
      (t) => ({ ...t, url: t.url.replace('2'.repeat(24), '9'.repeat(24)) }),
      'Hosted transport URL differs',
    ],
    [
      'mutable URL',
      (t) => ({ ...t, url: 'https://splotch.netlify.app/migration-install-topology.json' }),
      'Hosted transport URL differs',
    ],
    ['query', (t) => ({ ...t, url: t.url + '?cache=1' }), 'Hosted transport URL differs'],
    ['fragment', (t) => ({ ...t, url: t.url + '#body' }), 'Hosted transport URL differs'],
    [
      'credentials',
      (t) => ({ ...t, url: t.url.replace('https://', 'https://user@') }),
      'Hosted transport URL differs',
    ],
    [
      'insecure transport',
      (t) => ({ ...t, url: t.url.replace('https:', 'http:') }),
      'Hosted transport URL differs',
    ],
    ['status', (t) => ({ ...t, status: 404 }), 'Hosted transport status differs'],
    ['HTML', (t) => ({ ...t, contentType: 'text/html' }), 'Hosted transport content type differs'],
    [
      'JSON prefix',
      (t) => ({ ...t, contentType: 'application/jsonx' }),
      'Hosted transport content type differs',
    ],
    ['byte count', (t) => ({ ...t, bytes: t.bytes - 1 }), 'Hosted transport byte count differs'],
    ['digest', (t) => ({ ...t, sha256: '0'.repeat(64) }), 'Hosted transport bytes differ'],
  ])('refuses transport %s and restores the complete response binding', (_, mutate, reason) => {
    const { contractBytes, record, metadata, transport, check } = fixture();
    expect(() =>
      checkHostedTopologyBytes(
        bytes(record),
        contractBytes,
        record.inspection.commit,
        metadata,
        mutate(transport)
      )
    ).toThrow(reason);
    expect(check().disposition).toBe('hosted-topology-invariants-verified');
  });

  it('refuses locally changed valid graph bytes bound to the original transport', () => {
    const { contract, record, check } = fixture();
    const changed = structuredClone(record);
    const oldPath = changed.inspection.installed[0].path;
    const newPath = 'node_modules/requirec';
    changed.inspection.installed[0].path = newPath;
    for (const row of changed.inspection.resolutions) if (row.path === oldPath) row.path = newPath;
    expect(() => assertTopologyGraph(changed.inspection, contract)).not.toThrow();
    expect(() => check(changed)).toThrow('Hosted transport bytes differ');
    expect(check().disposition).toBe('hosted-topology-invariants-verified');
  });

  it.each([
    [
      'schema',
      (r) => {
        r.schemaVersion = 2;
      },
      'Hosted topology schema differs',
    ],
    [
      'timing',
      (r) => {
        r.observation = 'prebuild';
      },
      'Observation timing differs',
    ],
    [
      'contract digest',
      (r) => {
        r.contractSha256 = '0'.repeat(64);
      },
      'Contract bytes differ',
    ],
    [
      'source commit',
      (r) => {
        r.inspection.commit = '2'.repeat(40);
      },
      'Artifact commit differs',
    ],
    [
      'source input',
      (r) => {
        r.inspection.rootManifestSha256 = '0'.repeat(64);
      },
      'Proof input differs',
    ],
    [
      'observed pnpm',
      (r) => {
        r.inspection.packageManagerVersion = '11.21.0';
      },
      'Observed package manager differs',
    ],
    [
      'scope',
      (r) => {
        r.inspection.scope = 'Native performance passed';
      },
      'Inspection scope differs',
    ],
    [
      'installed count',
      (r) => {
        r.inspection.installedPackageCount++;
      },
      'Installed package count differs',
    ],
    [
      'exclusive count',
      (r) => {
        r.inspection.candidateExclusiveArtifactCount++;
      },
      'Candidate-exclusive count differs',
    ],
    [
      'exclusive package',
      (r) => {
        r.inspection.installed[0].key = 'expo@57.0.26';
      },
      'Candidate-exclusive installed contamination',
    ],
    [
      'undeclared package',
      (r) => {
        r.inspection.installed[0].key = 'unknown@1.0.0';
      },
      'outside production graph',
    ],
    [
      'escaping path',
      (r) => {
        r.inspection.installed[0].path = '../required';
      },
      'path escapes checkout',
    ],
    [
      'duplicate path',
      (r) => {
        r.inspection.installed.push(r.inspection.installed[0]);
        r.inspection.installedPackageCount++;
      },
      'Duplicate installed path',
    ],
    [
      'ordering',
      (r) => {
        r.inspection.installed.reverse();
      },
      'Unsorted installed rows',
    ],
    [
      'missing resolution',
      (r) => {
        r.inspection.resolutions.pop();
      },
      'Production resolution matrix differs',
    ],
    [
      'undeclared context',
      (r) => {
        r.inspection.resolutions[0].context = 'elsewhere';
      },
      'Production resolution matrix differs',
    ],
    [
      'missing resolved package',
      (r) => {
        r.inspection.resolutions[0].path = 'other/required';
      },
      'Resolution has no matching installed package',
    ],
    [
      'unselected secret',
      (r) => {
        r.deploy.SECRET_TOKEN = 'not-allowed';
      },
      'Deploy identity fields differ',
    ],
    [
      'wrong deploy',
      (r) => {
        r.deploy.id = '9'.repeat(24);
      },
      'Hosted deploy identity differs',
    ],
  ])('refuses %s at its owner and restores the valid graph', (_, mutate, reason) => {
    const { record, check } = fixture();
    const changed = structuredClone(record);
    mutate(changed);
    expect(() => check(changed)).toThrow(reason);
    expect(check().disposition).toBe('hosted-topology-invariants-verified');
  });

  it.each([
    ['commit_ref', '9'.repeat(40), 'Deploy commit differs'],
    ['branch', 'main', 'Deploy branch differs'],
    ['context', 'production', 'Deploy context differs'],
    ['state', 'building', 'Deploy is not ready'],
    ['build_id', '9'.repeat(24), 'Hosted deploy identity differs'],
    ['site_id', '99999999-9999-9999-9999-999999999999', 'Hosted deploy identity differs'],
  ])(
    'refuses mismatched selected metadata %s and restores the source binding',
    (key, value, reason) => {
      const { record, metadata, check } = fixture();
      expect(() => check(record, { ...metadata, [key]: value })).toThrow(reason);
      expect(check().disposition).toBe('hosted-topology-invariants-verified');
    }
  );

  it('distinguishes missing-file HTML and truncated JSON from graph rejection', () => {
    const { contractBytes, metadata, record, check } = fixture();
    expect(() =>
      checkHostedTopologyBytes(
        Buffer.from('<html>SSR catch-all</html>'),
        contractBytes,
        record.inspection.commit,
        metadata,
        transportReceipt(bytes(record), metadata)
      )
    ).toThrow('Hosted file is HTML');
    expect(() =>
      checkHostedTopologyBytes(
        bytes(record).subarray(0, 20),
        contractBytes,
        record.inspection.commit,
        metadata,
        transportReceipt(bytes(record), metadata)
      )
    ).toThrow(SyntaxError);
    expect(check().disposition).toBe('hosted-topology-invariants-verified');
  });

  it('refuses malformed UTF-8 before parsing and restores complete valid bytes', () => {
    const { contractBytes, metadata, record, check } = fixture();
    const malformed = Buffer.concat([
      Buffer.from('{"path":"'),
      Buffer.from([0xff]),
      Buffer.from('"}'),
    ]);
    expect(() =>
      checkHostedTopologyBytes(
        malformed,
        contractBytes,
        record.inspection.commit,
        metadata,
        transportReceipt(bytes(record), metadata)
      )
    ).toThrow(TypeError);
    expect(check().disposition).toBe('hosted-topology-invariants-verified');
  });

  it('refuses existing files and dangling links without replacing bytes, then restores a fresh output', () => {
    const { root, record } = fixture();
    const path = join(root, TOPOLOGY_EXPORT_PATH);
    writeHostedTopologyFile(root, record);
    const before = readFileSync(path);
    expect(() => writeHostedTopologyFile(root, record)).toThrow('EEXIST');
    expect(readFileSync(path)).toEqual(before);
    rmSync(path);
    symlinkSync(join(root, 'missing.json'), path);
    expect(() => writeHostedTopologyFile(root, record)).toThrow('EEXIST');
    rmSync(path);
    expect(writeHostedTopologyFile(root, record).disposition).toBe(
      'complete-topology-export-written'
    );
  });

  it.each([
    [{ BRANCH: 'main' }, 0, 'not-the-selected-proof-ref'],
    [{ BRANCH: TOPOLOGY_PROOF_BRANCH, NETLIFY: 'false' }, 1, 'actual Netlify context'],
    [
      {
        BRANCH: TOPOLOGY_PROOF_BRANCH,
        NETLIFY: 'true',
        CONTEXT: 'branch-deploy',
        COMMIT_REF: '1'.repeat(40),
        CAPACITOR: 'true',
      },
      1,
      'web publish build',
    ],
    [
      {
        BRANCH: TOPOLOGY_PROOF_BRANCH,
        NETLIFY: 'true',
        CONTEXT: 'branch-deploy',
        COMMIT_REF: '1'.repeat(40),
        PERF_MARKS: 'true',
      },
      1,
      'shipping build',
    ],
  ])('runs the actual export CLI with the bounded context %j', (env, status, message) => {
    const result = spawnSync(
      process.execPath,
      [join(ROOT, 'tools/migration/gen-hosted-topology.mjs')],
      {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: CLI_TIMEOUT_MS,
      }
    );
    expect(result.status).toBe(status);
    expect(status === 0 ? result.stdout : result.stderr).toContain(message);
  });
});
