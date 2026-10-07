import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  WEB_HOST_VARIANT,
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_NEUTRAL_COPY_ROLES,
  WEB_HOST_REACT_OUTPUT_PATHS,
  webHostCopyRoles,
  WEB_HOST_OUTPUT_PATHS,
} from '../../../migration/probes/web-host/host/contract.ts';
import { fileInventory } from './web-host-files.mjs';
import { canonicalDirectory, ownedPath, pathInside } from './web-host-ownership.mjs';

const INPUT_SCHEMA_VERSION = 2;
const DEPENDENCY_SCRATCH_PATHS = ['node_modules/.vite', 'node_modules/.vite-temp'];
const KIT_SUPPORT_PATH = 'web/.svelte-kit';
const ROW_KEYS = ['bytes', 'kind', 'link', 'mode', 'path', 'sha256', 'target'];

function insidePath(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function safePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe bound input path: ${path}`);
  return path;
}

function assertRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Bound input inventory is missing');
  const paths = new Set();
  let prior = '';
  for (const row of rows) {
    if (
      !row ||
      Object.keys(row).sort().join() !== ROW_KEYS.join() ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      !Number.isInteger(row.mode) ||
      row.mode < 0 ||
      row.mode > 0o777 ||
      !/^[a-f0-9]{64}$/.test(row.sha256 ?? '') ||
      !['file', 'symlink'].includes(row.kind) ||
      (row.kind === 'file'
        ? row.link !== null || row.target !== null
        : typeof row.link !== 'string' || typeof row.target !== 'string')
    )
      throw new Error('Malformed bound input row');
    safePath(row.path);
    if (paths.has(row.path)) throw new Error(`Duplicate bound input path: ${row.path}`);
    if (prior && row.path < prior) throw new Error('Bound input inventory is not sorted');
    paths.add(row.path);
    prior = row.path;
  }
}

function assertRole(role) {
  if (!WEB_HOST_NEUTRAL_COPY_ROLES.includes(role))
    throw new Error(`Unsupported copy role: ${role}`);
}

function assertKeys(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw new Error(`Malformed ${label}`);
}

function assertBindingShape(bindings) {
  assertKeys(
    bindings,
    ['schemaVersion', 'variant', 'sourcePaths', 'generatedPaths', 'roles'],
    'input binding'
  );
  if (
    bindings.schemaVersion !== INPUT_SCHEMA_VERSION ||
    !Array.isArray(bindings.sourcePaths) ||
    !Array.isArray(bindings.generatedPaths)
  )
    throw new Error('Artifact omitted its complete bound input inventory');
  for (const paths of [bindings.sourcePaths, bindings.generatedPaths]) {
    for (const path of paths) safePath(path);
    if (
      new Set(paths).size !== paths.length ||
      JSON.stringify(paths) !== JSON.stringify([...paths].sort())
    )
      throw new Error('Bound input paths are not unique and sorted');
  }
  const roles = webHostCopyRoles(bindings.variant);
  assertKeys(bindings.roles, roles, 'copy roles');
  for (const role of roles) {
    const record = bindings.roles[role];
    assertKeys(
      record,
      [
        ...(record?.frozen === null
          ? ['source', 'dependencies', 'scratchBefore', 'frozen']
          : ['source', 'dependencies', 'scratchBefore', 'frozen', 'scratchAfter']),
        ...(role === WEB_HOST_NEUTRAL_COPY_ROLE ? ['react'] : []),
      ],
      'copy binding'
    );
    assertRows(record.source);
    assertRows(record.dependencies);
    assertRows(record.scratchBefore);
    if (role === WEB_HOST_NEUTRAL_COPY_ROLE) {
      assertKeys(record.react, ['source', 'outputs'], 'React preparation binding');
      if (record.react.source !== null) assertRows(record.react.source);
      if (record.react.outputs !== null) {
        assertRows(record.react.outputs);
        if (
          record.react.source === null ||
          record.react.outputs
            .map((row) => row.path)
            .sort()
            .join() !== [...WEB_HOST_REACT_OUTPUT_PATHS].sort().join() ||
          record.react.outputs.some((row) => row.kind !== 'file')
        )
          throw new Error('React preparation omitted its frozen source or exact renderer outputs');
      }
    }
    if (record.frozen !== null) {
      assertKeys(record.frozen, ['source', 'support'], 'frozen copy binding');
      assertRows(record.frozen.source);
      assertRows(record.frozen.support);
      assertRows(record.scratchAfter);
    }
  }
}

function inventoryCopy(owned, role) {
  assertRole(role);
  const root = ownedPath(owned, role);
  if (canonicalDirectory(root) !== join(owned.root, role))
    throw new Error(`Copy root changed: ${role}`);
  canonicalDirectory(join(root, 'node_modules'));
  const rows = fileInventory(root);
  for (const row of rows) {
    const path = ownedPath(owned, join(role, row.path));
    if (!pathInside(root, realpathSync(path)))
      throw new Error(`Input link escapes ${role}: ${row.path}`);
    if (row.kind === 'file' && lstatSync(path).nlink !== 1)
      throw new Error(`Input aliases a borrowed inode: ${role}/${row.path}`);
  }
  return rows;
}

function outputKind(path) {
  if (DEPENDENCY_SCRATCH_PATHS.some((root) => insidePath(path, root))) return 'scratch';
  if (WEB_HOST_OUTPUT_PATHS.some((root) => insidePath(path, root))) return 'product';
  if (insidePath(path, KIT_SUPPORT_PATH)) return 'support';
  return null;
}

function classifyRows(rows, bindings, role) {
  const sourcePaths = new Set([...bindings.sourcePaths, ...bindings.generatedPaths]);
  const grouped = {
    source: [],
    dependencies: [],
    support: [],
    scratch: [],
    product: [],
    react: [],
  };
  for (const row of rows) {
    const kind = outputKind(row.path);
    if (sourcePaths.has(row.path)) {
      if (kind) throw new Error(`Frozen source collides with generated output: ${row.path}`);
      grouped.source.push(row);
    } else if (
      role === WEB_HOST_NEUTRAL_COPY_ROLE &&
      WEB_HOST_REACT_OUTPUT_PATHS.includes(row.path)
    ) {
      if (bindings.roles[role]?.react?.source == null)
        throw new Error(`React output appeared before source freezing: ${row.path}`);
      grouped.react.push(row);
    } else if (kind) grouped[kind].push(row);
    else if (insidePath(row.path, 'node_modules')) grouped.dependencies.push(row);
    else throw new Error(`Unregistered copied file: ${row.path}`);
  }
  return grouped;
}

function sameRows(actual, expected, role, label) {
  const expectedMap = new Map(expected.map((row) => [row.path, row]));
  for (const row of actual) {
    if (JSON.stringify(row) !== JSON.stringify(expectedMap.get(row.path)))
      throw new Error(`Bound ${label} changed: ${role}/${row.path}`);
    expectedMap.delete(row.path);
  }
  if (expectedMap.size)
    throw new Error(`Bound ${label} removed: ${role}/${expectedMap.keys().next().value}`);
}

function assertGeneratingSource(actual, original, generatedPaths, role) {
  const generated = new Set(generatedPaths);
  sameRows(
    actual.filter((row) => !generated.has(row.path)),
    original.filter((row) => !generated.has(row.path)),
    role,
    'source'
  );
  for (const row of actual.filter((entry) => generated.has(entry.path))) {
    const before = original.find((entry) => entry.path === row.path);
    if (row.kind !== 'file' || (before && (row.kind !== before.kind || row.mode !== before.mode)))
      throw new Error(`Generator changed input type/mode: ${role}/${row.path}`);
  }
}

export function captureInputBindings(owned, snapshot, variant = WEB_HOST_VARIANT) {
  const bindings = {
    schemaVersion: INPUT_SCHEMA_VERSION,
    variant,
    sourcePaths: snapshot.entries.map((row) => row.path).sort(),
    generatedPaths: [],
    roles: {},
  };
  if (bindings.sourcePaths.some((path) => WEB_HOST_REACT_OUTPUT_PATHS.includes(path)))
    throw new Error('Compiled React outputs cannot be maintained source inputs');
  for (const role of webHostCopyRoles(variant)) {
    const rows = classifyRows(inventoryCopy(owned, role), bindings, role);
    for (const expected of snapshot.entries) {
      const row = rows.source.find((entry) => entry.path === expected.path);
      if (
        !row ||
        row.sha256 !== expected.sha256 ||
        row.link !== expected.link ||
        !!(row.mode & 0o111) !== expected.executable
      )
        throw new Error(`Materialized source differs: ${role}/${expected.path}`);
    }
    bindings.roles[role] = {
      source: rows.source,
      dependencies: rows.dependencies,
      scratchBefore: rows.scratch,
      frozen: null,
      ...(role === WEB_HOST_NEUTRAL_COPY_ROLE ? { react: { source: null, outputs: null } } : {}),
    };
  }
  return bindings;
}

export function withGeneratedInputs(bindings, paths) {
  assertBindingShape(bindings);
  for (const path of paths) {
    safePath(path);
    if (
      outputKind(path) ||
      insidePath(path, 'node_modules') ||
      WEB_HOST_REACT_OUTPUT_PATHS.includes(path)
    )
      throw new Error(`Generator output collides with protected namespace: ${path}`);
  }
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate generator output paths');
  return { ...bindings, generatedPaths: [...paths].sort() };
}

export function assertCopyInputs(owned, bindings, role) {
  assertBindingShape(bindings);
  assertRole(role);
  if (!webHostCopyRoles(bindings.variant).includes(role))
    throw new Error(`Copy role is outside its input binding: ${role}`);
  const actual = classifyRows(inventoryCopy(owned, role), bindings, role);
  const expected = bindings.roles[role];
  if (role === WEB_HOST_NEUTRAL_COPY_ROLE) {
    if (expected.react.source !== null)
      sameRows(actual.source, expected.react.source, role, 'React preparation source');
    if (expected.react.outputs !== null)
      sameRows(actual.react, expected.react.outputs, role, 'React renderer');
  }
  sameRows(actual.dependencies, expected.dependencies, role, 'dependency');
  if (expected.frozen) {
    sameRows(actual.source, expected.frozen.source, role, 'source');
    sameRows(actual.support, expected.frozen.support, role, 'Kit support');
  } else assertGeneratingSource(actual.source, expected.source, bindings.generatedPaths, role);
  return actual;
}

export function freezeCopyInputs(owned, bindings, role) {
  const actual = assertCopyInputs(owned, bindings, role);
  for (const path of bindings.generatedPaths) {
    if (!actual.source.some((row) => row.path === path && row.kind === 'file'))
      throw new Error(`Generator omitted output: ${role}/${path}`);
  }
  const record = bindings.roles[role];
  if (role === WEB_HOST_NEUTRAL_COPY_ROLE && record.react.outputs === null)
    throw new Error('Neutral build cannot freeze before its renderer outputs');
  return {
    ...bindings,
    roles: {
      ...bindings.roles,
      [role]: {
        ...record,
        frozen: { source: actual.source, support: actual.support },
        scratchAfter: actual.scratch,
      },
    },
  };
}

export function assertFinalInputBindings(owned, bindings) {
  assertBindingShape(bindings);
  for (const role of webHostCopyRoles(bindings.variant)) {
    if (!bindings.roles[role].frozen) throw new Error(`Copied inputs are not frozen: ${role}`);
    assertCopyInputs(owned, bindings, role);
  }
}

export function freezeReactSourceInputs(owned, bindings) {
  const role = WEB_HOST_NEUTRAL_COPY_ROLE;
  const actual = assertCopyInputs(owned, bindings, role);
  const record = bindings.roles[role];
  if (record.react.source !== null || record.react.outputs !== null || actual.react.length)
    throw new Error('React preparation source must be frozen once before compilation');
  for (const path of bindings.generatedPaths)
    if (!actual.source.some((row) => row.path === path && row.kind === 'file'))
      throw new Error(`Generator omitted output: ${role}/${path}`);
  return {
    ...bindings,
    roles: {
      ...bindings.roles,
      [role]: { ...record, react: { source: actual.source, outputs: null } },
    },
  };
}

export function freezeReactRendererInputs(owned, bindings) {
  const role = WEB_HOST_NEUTRAL_COPY_ROLE;
  const actual = assertCopyInputs(owned, bindings, role);
  const record = bindings.roles[role];
  if (
    record.react.source === null ||
    record.react.outputs !== null ||
    actual.react
      .map((row) => row.path)
      .sort()
      .join() !== [...WEB_HOST_REACT_OUTPUT_PATHS].sort().join() ||
    actual.react.some((row) => row.kind !== 'file')
  )
    throw new Error('React compilation must emit its exact two owned renderer outputs once');
  return {
    ...bindings,
    roles: {
      ...bindings.roles,
      [role]: { ...record, react: { ...record.react, outputs: actual.react } },
    },
  };
}
