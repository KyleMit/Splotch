import { afterEach, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readJointNativeProjection } from '../lib/native-joint-graph.mjs';
import { projectRsdDrawingGraph } from '../lib/rsd-drawing-graph.mjs';
import { readLockFile } from '../lib/lock-artifacts.mjs';
import { readPolicyYaml } from '../lib/topology-policy.mjs';
const root = join(import.meta.dirname, '../../..');
const inputPath = 'tools/migration/inputs/rsd-drawing-graph.json';
const input = JSON.parse(readFileSync(join(root, inputPath)));
const fixtures = [];
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));
function values() {
  return {
    lock: readLockFile(join(root, input.approvedLock.path)),
    workspace: readPolicyYaml(join(root, 'pnpm-workspace.yaml')),
    baseline: readLockFile(join(root, input.baselineFiles['pnpm-lock.yaml'].path)),
    before: readPolicyYaml(join(root, input.baselineFiles['pnpm-workspace.yaml'].path)),
    approved: readLockFile(join(root, input.approvedLock.path)),
  };
}
function project(v) {
  return projectRsdDrawingGraph(v.lock, v.workspace, v.baseline, v.before, input, v.approved);
}
it('consumes the exact approved RSD delta then the unchanged SVG and Audio source owners', () => {
  const v = values();
  expect(project(v)).toEqual({ lock: v.baseline, workspace: v.before });
  const current = readJointNativeProjection(root);
  expect(current.rsd.input.addedArtifacts).toHaveLength(7);
  expect(current.rsd.archiveRows).toHaveLength(8);
  expect(current.rsd.safeInsets.input.delta.artifactKey).toBe(
    'react-native-safe-area-context@5.7.0'
  );
  expect(current.view.source.lockSha256).toBe(current.rsd.safeInsets.input.approvedLock.sha256);
});
for (const [name, mutate] of [
  [
    'inherited archive mutation',
    (v) => {
      v.lock.packages['expo-audio@57.0.5'].resolution.integrity = 'foreign';
    },
  ],
  [
    'new archive mutation',
    (v) => {
      v.lock.packages['react-strict-dom@0.0.54'].resolution.integrity = 'foreign';
    },
  ],
  [
    'unexpected snapshot',
    (v) => {
      v.lock.snapshots['foreign@1.0.0'] = {};
    },
  ],
  [
    'shipping importer mutation',
    (v) => {
      v.lock.importers['.'].dependencies.foreign = { specifier: '1', version: '1' };
    },
  ],
  [
    'hook policy relaxation',
    (v) => {
      v.workspace.allowBuilds.esbuild = true;
    },
  ],
  [
    'extra override',
    (v) => {
      v.workspace.overrides.foreign = '1';
    },
  ],
  [
    'declaration patch registration',
    (v) => {
      v.workspace.patchedDependencies['react-strict-dom@0.0.54'] = 'foreign';
    },
  ],
])
  it(`refuses ${name} through the actual projection consumer`, () => {
    const v = values();
    mutate(v);
    expect(() => project(v)).toThrow();
  });
it('refuses modified derived evidence before interpreting any new graph', () => {
  const path = mkdtempSync(join(tmpdir(), 'splotch-rsd-derived-'));
  fixtures.push(path);
  const old = JSON.parse(
    readFileSync(join(root, 'tools/migration/inputs/native-joint-graph.json'))
  );
  const names = new Set([
    'tools/migration/inputs/native-joint-graph.json',
    inputPath,
    ...old.files.map(({ path }) => path),
    ...input.actualFiles.map(({ path }) => path),
    ...Object.values(input.baselineFiles).map(({ path }) => path),
    input.approvedLock.path,
    input.archiveReuse.path,
    input.rootApproval.path,
    input.rootArchiveApproval.path,
    'tools/migration/inputs/native-svg-backdrop-patch.json',
  ]);
  for (const name of names) {
    mkdirSync(dirname(join(path, name)), { recursive: true });
    copyFileSync(join(root, name), join(path, name));
  }
  const bytes = readFileSync(join(path, inputPath));
  writeFileSync(join(path, inputPath), Buffer.concat([bytes, Buffer.from(' ')]));
  expect(() => readJointNativeProjection(path)).toThrow('Unqualified joint input');
});
