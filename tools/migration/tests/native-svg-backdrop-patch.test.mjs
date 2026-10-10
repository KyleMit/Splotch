import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readLockFile } from '../lib/lock-artifacts.mjs';
import { readPolicyYaml } from '../lib/topology-policy.mjs';
import {
  projectSvgBackdropPatch,
  qualifySvgBackdropPatch,
  readSvgBackdropPatchInputs,
  verifySvgBackdropPackage,
} from '../lib/native-svg-backdrop-patch.mjs';

const root = join(import.meta.dirname, '../../..');
const input = readSvgBackdropPatchInputs(root);
const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
const baseline = readLockFile(join(root, input.baselineLock.path));
const workspace = readPolicyYaml(join(root, 'pnpm-workspace.yaml'));
const previousWorkspace = readPolicyYaml(join(root, input.baselineWorkspace.path));
const java = 'android/src/main/java/com/horcrux/svg/SvgView.java';
const patchedJava = join(
  root,
  'docs/migration/evidence/native-svg-backdrop-20261009/SvgView.patched.java.txt'
);
const fixtures = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-svg-backdrop-source-'));
  fixtures.push(directory);
  return directory;
}

function put(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function packageFixture() {
  const directory = fixture();
  const packagePath = join(directory, 'node_modules/react-native-svg');
  for (const record of input.installedFiles) {
    const path = join(packagePath, record.path);
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(
      record.path === java ? patchedJava : join(root, 'node_modules/react-native-svg', record.path),
      path
    );
    chmodSync(path, record.mode);
  }
  for (const record of input.generatedPeerBins) {
    const target = join(directory, record.target.path);
    put(target, readFileSync(join(root, record.target.path)));
    chmodSync(target, record.target.mode);
    const link = join(packagePath, record.path);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(record.literal, link);
  }
  for (const path of [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    input.baselineLock.path,
    input.baselineWorkspace.path,
    input.patch.path,
    'tools/migration/inputs/native-svg-backdrop-patch.json',
    `${CANDIDATE_DIRECTORY}/package.json`,
  ])
    put(join(directory, path), readFileSync(join(root, path)));
  return { directory, packagePath };
}

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('the feature-owned SVG backdrop patch projection', () => {
  it('returns the exact inherited lock and workspace without modifying its inputs', () => {
    const original = structuredClone({ lock, workspace });
    expect(projectSvgBackdropPatch(lock, workspace, baseline, previousWorkspace, input)).toEqual({
      lock: baseline,
      workspace: previousWorkspace,
    });
    expect({ lock, workspace }).toEqual(original);
  });

  it('rejects changed registration, patch identity, importer and snapshot contents', () => {
    const wrongWorkspace = structuredClone(workspace);
    delete wrongWorkspace.patchedDependencies[input.identity];
    expect(() =>
      projectSvgBackdropPatch(lock, wrongWorkspace, baseline, previousWorkspace, input)
    ).toThrow('registration');
    const selected = structuredClone(lock);
    selected.patchedDependencies[input.identity] = 'unreviewed';
    expect(() =>
      projectSvgBackdropPatch(selected, workspace, baseline, previousWorkspace, input)
    ).toThrow('patch');
    selected.patchedDependencies[input.identity] = input.patch.sha256;
    selected.importers[CANDIDATE_DIRECTORY].devDependencies['react-native-svg'].specifier = '*';
    expect(() =>
      projectSvgBackdropPatch(selected, workspace, baseline, previousWorkspace, input)
    ).toThrow('importer');
    const changedSnapshot = structuredClone(lock);
    const key = Object.keys(changedSnapshot.snapshots).find((name) =>
      name.startsWith(`${input.identity}(`)
    );
    changedSnapshot.snapshots[key].dependencies['css-select'] = '0.0.0';
    expect(() =>
      projectSvgBackdropPatch(changedSnapshot, workspace, baseline, previousWorkspace, input)
    ).toThrow('snapshot');
  });

  it('rejects retained upstream snapshots, other artifact changes and policy bypasses', () => {
    const retained = structuredClone(lock);
    const key = Object.keys(baseline.snapshots).find((name) =>
      name.startsWith(`${input.identity}(`)
    );
    retained.snapshots[key] = baseline.snapshots[key];
    expect(() =>
      projectSvgBackdropPatch(retained, workspace, baseline, previousWorkspace, input)
    ).toThrow('Unpatched');
    const changed = structuredClone(lock);
    changed.packages[input.identity].resolution.integrity = 'sha512-unreviewed';
    expect(() =>
      projectSvgBackdropPatch(changed, workspace, baseline, previousWorkspace, input)
    ).toThrow('Unexpected SVG lock delta');
    expect(() =>
      projectSvgBackdropPatch(
        lock,
        { ...workspace, allowUnusedPatches: true },
        baseline,
        previousWorkspace,
        input
      )
    ).toThrow('workspace delta');
  });
});

describe('the complete effective SVG source fixture, without executing package code', () => {
  it('authenticates the supported patch result and preserves inherited projection', () => {
    const { directory } = packageFixture();
    const result = qualifySvgBackdropPatch(directory);
    expect(result.lock).toEqual(baseline);
    expect(result.workspace).toEqual(previousWorkspace);
    expect(result.qualification.installed.files).toBe(input.installedFiles.length);
  });

  it('rejects original upstream Java and accepts exact patched restoration', () => {
    const { directory, packagePath } = packageFixture();
    const target = join(packagePath, java);
    copyFileSync(
      join(root, 'docs/migration/evidence/native-svg-backdrop-20261009/SvgView.original.java.txt'),
      target
    );
    expect(() => verifySvgBackdropPackage(directory, packagePath, input)).toThrow('source changed');
    copyFileSync(patchedJava, target);
    expect(verifySvgBackdropPackage(directory, packagePath, input).files).toBe(
      input.installedFiles.length
    );
  });

  it('rejects changed patch bytes, extra source files and unreviewed generated peer bins', () => {
    const { directory, packagePath } = packageFixture();
    const patch = join(directory, input.patch.path);
    writeFileSync(patch, 'patch bypass');
    expect(() => qualifySvgBackdropPatch(directory)).toThrow('patch bytes');
    copyFileSync(join(root, input.patch.path), patch);
    put(join(packagePath, 'unreviewed.js'), 'unreviewed source');
    expect(() => verifySvgBackdropPackage(directory, packagePath, input)).toThrow('source changed');
    rmSync(join(packagePath, 'unreviewed.js'));
    const link = join(packagePath, 'node_modules/.bin/unreviewed');
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync('/bin/sh', link);
    expect(() => verifySvgBackdropPackage(directory, packagePath, input)).toThrow(
      /Unreviewed SVG (?:source link|directory)/
    );
    rmSync(link);
    expect(qualifySvgBackdropPatch(directory).qualification.installed.files).toBe(
      input.installedFiles.length
    );
  });

  it.each(['literal', 'foreign target', 'broken target', 'target bytes', 'target mode'])(
    'rejects a generated peer bin with changed %s',
    (change) => {
      const { directory, packagePath } = packageFixture();
      const record = input.generatedPeerBins[0];
      const link = join(packagePath, record.path);
      const target = join(directory, record.target.path);
      if (change === 'literal') {
        rmSync(link);
        symlinkSync('/bin/sh', link);
      } else if (change === 'foreign target') {
        rmSync(target);
        symlinkSync(join(root, record.target.path), target);
      } else if (change === 'broken target') {
        rmSync(target);
      } else if (change === 'target bytes') {
        writeFileSync(target, 'unreviewed target');
      } else {
        chmodSync(target, 0o644);
      }
      expect(() => verifySvgBackdropPackage(directory, packagePath, input)).toThrow();
      rmSync(link);
      rmSync(target, { force: true });
      put(target, readFileSync(join(root, record.target.path)));
      chmodSync(target, record.target.mode);
      symlinkSync(record.literal, link);
      expect(verifySvgBackdropPackage(directory, packagePath, input).files).toBe(
        input.installedFiles.length
      );
    }
  );

  it('rejects a resolved package outside its owner', () => {
    const { packagePath } = packageFixture();
    expect(() => verifySvgBackdropPackage(fixture(), packagePath, input)).toThrow('escapes owner');
  });
});

function methodBody(source, signature) {
  const start = source.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const first = source.indexOf('{', start);
  let depth = 1;
  let end = first + 1;
  for (; depth > 0 && end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  expect(depth).toBe(0);
  return source.slice(first + 1, end - 1);
}

// The finite Java body adaptation exercises binding lifecycle, not Android Canvas output.
function sourceLifecycle(source, observe) {
  for (const signature of [
    'private Bitmap drawOutput()',
    'String toDataURL()',
    'String toDataURL(int width, int height)',
  ]) {
    const body = methodBody(source, signature);
    expect(body).toMatch(/drawBitmap\(bitmap\);/);
    expect(body).not.toMatch(/drawChildren\(/);
  }
  const body = methodBody(source, 'private synchronized void drawBitmap(Bitmap bitmap)');
  expect(body.match(/Bitmap previousBitmap/g)).toHaveLength(1);
  const executable = body.replace('Bitmap previousBitmap', 'const previousBitmap');
  class Canvas {
    constructor(bitmap) {
      this.bitmap = bitmap;
    }
  }
  return runInNewContext(
    `
    let mCurrentBitmap = null;
    function drawChildren(canvas) { observe(canvas, mCurrentBitmap, drawBitmap); }
    function drawBitmap(bitmap) { ${executable} }
    ({ drawBitmap, current: () => mCurrentBitmap });
  `,
    { Canvas, observe }
  );
}

function sequentialTargets(source) {
  const observations = [];
  const owner = sourceLifecycle(source, (canvas, backdrop) => {
    expect(backdrop).toBe(canvas.bitmap);
    expect(backdrop.recycled).toBe(false);
    expect(backdrop.prefix).toEqual([]);
    observations.push([backdrop.width, backdrop.height]);
    backdrop.prefix.push('current paint only');
  });
  const screen = { width: 2048, height: 1536, prefix: [], recycled: false };
  owner.drawBitmap(screen);
  expect(owner.current()).toBe(null);
  screen.recycled = true;
  const exported = { width: 1024, height: 768, prefix: [], recycled: false };
  owner.drawBitmap(exported);
  expect(owner.current()).toBe(null);
  expect(observations).toEqual([
    [2048, 1536],
    [1024, 768],
  ]);
}

function exceptionalCleanup(source) {
  const failure = new Error('controlled drawing exception');
  const owner = sourceLifecycle(source, () => {
    throw failure;
  });
  expect(() => owner.drawBitmap({ width: 1024, height: 768 })).toThrow(failure);
  expect(owner.current()).toBe(null);
}

const javaSource = readFileSync(patchedJava, 'utf8');
describe('the source-derived Android backdrop lifecycle, without Java or native execution', () => {
  it('binds different screen and export dimensions to their own current paint prefix', () => {
    expect(() => sequentialTargets(javaSource)).not.toThrow();
  });

  it('restores the previous binding when drawing throws', () => {
    expect(() => exceptionalCleanup(javaSource)).not.toThrow();
  });

  it('restores the outer binding after nested helper calls', () => {
    const outer = { name: 'outer' },
      inner = { name: 'inner' };
    const owner = sourceLifecycle(javaSource, (canvas, backdrop, draw) => {
      expect(canvas.bitmap).toBe(backdrop);
      if (backdrop === outer) draw(inner);
      expect(owner.current()).toBe(backdrop);
    });
    owner.drawBitmap(outer);
    expect(owner.current()).toBe(null);
  });

  it('rejects the original call sites and omitted or retained bitmap bindings', () => {
    const original = readFileSync(
      join(root, 'docs/migration/evidence/native-svg-backdrop-20261009/SvgView.original.java.txt'),
      'utf8'
    );
    expect(() => sequentialTargets(original)).toThrow();
    for (const changed of [
      javaSource.replace(
        /(String toDataURL\(int width, int height\)[\s\S]*?)drawBitmap\(bitmap\);/,
        '$1drawChildren(new Canvas(bitmap));'
      ),
      javaSource.replace('    mCurrentBitmap = bitmap;\n', ''),
      javaSource.replace(
        '      mCurrentBitmap = previousBitmap;',
        '      mCurrentBitmap = bitmap;'
      ),
    ]) {
      expect(changed).not.toBe(javaSource);
      expect(() => sequentialTargets(changed)).toThrow();
    }
  });

  it('rejects restoration moved outside finally', () => {
    const changed = javaSource.replace(
      '    } finally {\n      mCurrentBitmap = previousBitmap;\n    }',
      '    } finally {\n    }\n    mCurrentBitmap = previousBitmap;'
    );
    expect(changed).not.toBe(javaSource);
    expect(() => exceptionalCleanup(changed)).toThrow();
  });
});
