import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import {
  artifactMap,
  candidateExclusiveArtifacts,
  changedArtifactMaps,
  getImporterArtifactKeys,
} from './lock-artifacts.mjs';
import { dependencySpecifiers, readJson } from './native-identity.mjs';

export function readPolicyYaml(path) {
  const document = parseDocument(readFileSync(path, 'utf8'), { uniqueKeys: true });
  assert.deepEqual(document.errors, [], `Invalid policy YAML: ${path}`);
  return document.toJS();
}

export function assertWorkspacePolicy(workspace) {
  assert.deepEqual(workspace.packages, [CANDIDATE_DIRECTORY], 'Unexpected workspace boundary');
  assert.equal(
    workspace.nodeLinker,
    'hoisted',
    'Shipping Capacitor paths require the hoisted linker'
  );
  assert.notEqual(workspace.strictDepBuilds, false, 'Unknown hooks must fail');
  assert.notEqual(
    workspace.ignoreScripts,
    true,
    'Ignoring scripts cannot prove the reviewed policy'
  );
  for (const name of ['@google/genai', 'esbuild', 'dprint', 'protobufjs']) {
    assert.equal(workspace.allowBuilds?.[name], false, `Existing script verdict changed: ${name}`);
  }
  assert.ok(
    Object.values(workspace.allowBuilds).every((value) => value === false),
    'This topology unit has no approved executing dependency hook'
  );
}

export function assertJavaScriptLocks(paths) {
  const locks = paths.filter((path) =>
    /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(path)
  );
  assert.deepEqual(locks, ['pnpm-lock.yaml'], 'Competing JavaScript lockfile');
}

export function assertAlignmentUpdateOwner(dependabot, alignment) {
  const owner = dependabot.updates.filter(
    (update) => update['package-ecosystem'] === 'npm' && update.directory === '/'
  );
  assert.equal(owner.length, 1, 'One root npm update owner is required');
  for (const name of Object.keys(alignment.directPackages)) {
    assert.ok(
      owner[0].ignore?.some(
        (rule) => rule['dependency-name'] === name && !rule.versions && !rule['update-types']
      ),
      `Missing root-wide manual SDK alignment policy: ${name}`
    );
  }
}

export function assertProductionClosure(lock, baselineArtifacts) {
  const baseline = new Set(baselineArtifacts);
  const production = getImporterArtifactKeys(lock, '.');
  const candidate = getImporterArtifactKeys(lock, CANDIDATE_DIRECTORY, true);
  const leaks = [...candidate].filter((key) => production.has(key) && !baseline.has(key));
  assert.deepEqual(
    leaks,
    [],
    `Candidate artifacts entered the shipping production graph: ${leaks.join(', ')}`
  );
  return {
    shippingArtifacts: production.size,
    candidateArtifacts: candidate.size,
    sharedArtifacts: [...candidate].filter((key) => production.has(key)).length,
  };
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|cjs|svelte)$/.test(entry.name) &&
      !/\.(?:test|spec)\./.test(entry.name)
      ? [path]
      : [];
  });
}

function scriptSource(source, filename) {
  if (!filename.endsWith('.svelte')) return source;
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join('\n');
}

function localSource(root, path, specifier) {
  const base = specifier.startsWith('.')
    ? resolve(dirname(path), specifier)
    : specifier.startsWith('$lib/')
      ? join(root, 'web/src/lib', specifier.slice('$lib/'.length))
      : null;
  if (!base) return null;
  assert.ok(
    !relative(root, base).startsWith(`${CANDIDATE_DIRECTORY}/`),
    `${path} imports the candidate workspace`
  );
  const extensions = ['', '.mjs', '.cjs', '.ts', '.tsx', '.js', '.svelte'];
  const resolved = extensions
    .map((extension) => `${base}${extension}`)
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!resolved || !extensions.includes(extname(resolved))) return null;
  const physical = realpathSync(resolved);
  assert.ok(
    !relative(root, physical).startsWith(`${CANDIDATE_DIRECTORY}/`),
    `${path} resolves into the candidate workspace`
  );
  return physical;
}

export function assertShippingImports(root, forbiddenPackages) {
  root = realpathSync(root);
  const forbidden = new Set(forbiddenPackages);
  const production = readJson(join(root, 'knip.production.json'));
  const tooling = production.entry
    .filter((entry) => entry.startsWith('tools/') && !entry.includes('*'))
    .map((entry) => join(root, entry.replace(/!$/, '')));
  const pending = [
    ...sourceFiles(join(root, 'web/src')),
    ...sourceFiles(join(root, 'netlify/functions')),
    ...tooling,
    join(root, 'web/svelte.config.js'),
    join(root, 'web/vite.config.ts'),
  ];
  const visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    const source = scriptSource(readFileSync(path, 'utf8'), path);
    for (const specifier of dependencySpecifiers(source, path)) {
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      assert.ok(
        !forbidden.has(name),
        `${relative(root, path)} imports candidate-only ${specifier}`
      );
      const imported = localSource(root, path, specifier);
      if (imported) pending.push(imported);
    }
  }
  return {
    scannedShippingFiles: visited.size,
    scope:
      'Shipping source plus local production-entry import/re-export/dynamic-literal/require closure; computed imports and subprocess commands remain owned by production Knip/build checks',
  };
}

export function assertCandidateArtifactRecord(record, lock, lockSha256) {
  assert.equal(record.schemaVersion, 1, 'Unsupported candidate artifact record');
  assert.equal(record.lockSha256, lockSha256, 'Candidate artifact record does not match the lock');
  const artifacts = candidateExclusiveArtifacts(lock)
    .map(({ key, name, version }) => ({ key, name, version }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  assert.deepEqual(
    record.artifacts,
    artifacts,
    'Candidate artifact record is incomplete or changed'
  );
}

export function assertArtifactInventory(inventory, artifacts, lockSha256, baseline) {
  assert.equal(inventory.complete, true, 'Incomplete pre-install archive inventory');
  assert.equal(baseline.schemaVersion, 1, 'Unsupported baseline artifact record');
  assert.match(baseline.sourceRevision, /^[a-f0-9]{40}$/, 'Missing baseline source revision');
  assert.equal(
    inventory.baselineLockSha256,
    baseline.lockSha256,
    'Inventory baseline differs from its source owner'
  );
  const selection = changedArtifactMaps(
    artifactMap({ packages: baseline.packages }),
    artifacts
  ).map(({ key, integrity }) => ({ key, integrity }));
  const byKey = (left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  assert.deepEqual(
    [...inventory.selectedArtifacts].sort(byKey),
    selection.sort(byKey),
    'Inventory selection differs from the actual baseline-to-current lock diff'
  );
  assert.equal(inventory.candidateLockSha256, lockSha256, 'Lock changed after its archive review');
  assert.equal(inventory.inspectedArtifacts, inventory.rows.length, 'Inventory row count differs');
  const expected = inventory.selectedArtifacts.map((artifact) => artifact.key).sort();
  assert.deepEqual(
    inventory.rows.map((row) => row.key).sort(),
    expected,
    'Omitted or extra archive row'
  );
  for (const artifact of inventory.selectedArtifacts) {
    assert.equal(
      artifacts.get(artifact.key)?.integrity,
      artifact.integrity,
      `Selection differs from lock: ${artifact.key}`
    );
  }
  const rows = new Map(inventory.rows.map((row) => [row.key, row]));
  assert.equal(rows.size, inventory.rows.length, 'Duplicate inventory identity');
  for (const row of inventory.rows) {
    const selected = artifacts.get(row.key);
    assert.ok(selected, `Inventory artifact absent from lock: ${row.key}`);
    assert.equal(row.integrity, selected.integrity, `Artifact changed after review: ${row.key}`);
    assertArchiveVerdict(row);
  }
  return { reviewedArtifacts: rows.size };
}

function assertArchiveVerdict(row) {
  assert.equal(row.archiveIntegrityVerified, true, `Archive integrity unverified: ${row.key}`);
  assert.deepEqual(row.rootHookFiles, [], `Unreviewed root .hooks: ${row.key}`);
  assert.equal(row.rootBindingGyp, false, `Unreviewed default install: ${row.key}`);
  assert.ok(
    row.hooks && typeof row.hooks === 'object' && !Array.isArray(row.hooks),
    `Invalid archive hooks: ${row.key}`
  );
  const hooks = Object.keys(row.hooks);
  assert.ok(
    Object.values(row.hooks).every((command) => typeof command === 'string'),
    `Invalid archive hook command: ${row.key}`
  );
  if (hooks.length) {
    assert.deepEqual(hooks, ['prepare'], `Unreviewed install hook: ${row.key}`);
    assert.equal(row.disposition, 'registry-publication-only-no-execution-needed');
    assert.equal(row.rootReviewed, true, `Publisher prepare disposition needs review: ${row.key}`);
  } else assert.equal(row.disposition, 'no-install-hooks');
}

export function assertCandidateArchiveInventory(inventory, lock, baseline) {
  assert.equal(inventory.schemaVersion, 1, 'Unsupported candidate archive inventory');
  assert.equal(inventory.complete, true, 'Incomplete pre-install archive inventory');
  assert.equal(baseline.schemaVersion, 1, 'Unsupported baseline artifact record');
  assert.match(baseline.sourceRevision, /^[a-f0-9]{40}$/, 'Missing baseline source revision');
  assert.ok(Array.isArray(inventory.rows), 'Missing reviewed archive rows');
  assert.equal(inventory.inspectedArtifacts, inventory.rows.length, 'Inventory row count differs');
  const rows = new Map(inventory.rows.map((row) => [row.key, row]));
  assert.equal(rows.size, inventory.rows.length, 'Duplicate inventory identity');
  const artifacts = artifactMap(lock);
  const closure = getImporterArtifactKeys(lock, CANDIDATE_DIRECTORY, true);
  const required = changedArtifactMaps(
    artifactMap({ packages: baseline.packages }),
    new Map([...closure].map((key) => [key, artifacts.get(key)]))
  );
  for (const artifact of required) {
    const row = rows.get(artifact.key);
    assert.ok(row, `Missing reviewed candidate archive: ${artifact.key}`);
    assert.equal(row.name, artifact.name, `Reviewed archive name changed: ${artifact.key}`);
    assert.equal(
      row.version,
      artifact.version,
      `Reviewed archive version changed: ${artifact.key}`
    );
    assert.equal(
      row.integrity,
      artifact.integrity,
      `Artifact changed after review: ${artifact.key}`
    );
    assert.ok(
      typeof row.tarball === 'string' && URL.canParse(row.tarball),
      `Invalid reviewed archive URL: ${artifact.key}`
    );
    const url = new URL(row.tarball);
    assert.ok(
      url.origin === 'https://registry.npmjs.org' && !url.username && !url.password,
      `Nonregistry reviewed archive: ${artifact.key}`
    );
    if (artifact.tarball)
      assert.equal(row.tarball, artifact.tarball, `Reviewed archive URL changed: ${artifact.key}`);
    assertArchiveVerdict(row);
  }
  return { candidateArtifacts: closure.size, reviewedArtifacts: required.length };
}
