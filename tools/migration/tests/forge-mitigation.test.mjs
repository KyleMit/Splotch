import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { assertForgeMitigationPolicy } from '../lib/forge-mitigation.mjs';
import {
  collectForgeInstallPackages,
  inspectForgeReferences,
  verifyInstalledForgeFiles,
} from '../lib/forge-installed.mjs';
import { readLockFile } from '../lib/lock-artifacts.mjs';
import { qualifyJointNativeInputs } from '../lib/native-joint-graph.mjs';
import { assertForgeConsumerEntries } from '../lib/forge-controls.mjs';

const root = join(import.meta.dirname, '../../..');
const mitigation = JSON.parse(
  readFileSync(join(root, 'tools/migration/inputs/forge-mitigation.json'), 'utf8')
);
const baselinePath = join(import.meta.dirname, 'fixtures/forge-baseline-195.yaml.txt');
const baselineBytes = readFileSync(baselinePath);
const lock = readLockFile(baselinePath);
const workspace = qualifyJointNativeInputs(root).audio.inheritedWorkspace;
const fixtures = [];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-forge-guard-'));
  fixtures.push(path);
  return path;
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function policyFixture() {
  const path = fixture();
  write(join(path, mitigation.patchPath), readFileSync(join(root, mitigation.patchPath)));
  return path;
}

function packageFixture(path, name, source) {
  write(
    join(path, 'package.json'),
    JSON.stringify({
      name,
      version: name === 'node-forge' ? mitigation.version : '1.0.0',
      main: 'index.js',
    })
  );
  write(join(path, 'index.js'), source);
}

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('the exact Forge mitigation policy', () => {
  it('pins the pre-drawing four-path importer fixture independently of new N1 roots', () => {
    expect(digest(baselineBytes)).toBe(
      '705b57623e37d509826f4b6aa42b00d4957d7dd295165d462523b075e42a9f92'
    );
    expect(lock.importers[CANDIDATE_DIRECTORY].devDependencies).not.toHaveProperty(
      'expo-file-system'
    );
    expect(lock.importers[CANDIDATE_DIRECTORY].devDependencies).not.toHaveProperty('expo-sharing');
  });
  it('accepts only the reviewed patch hash and complete candidate-owned paths', () => {
    expect(assertForgeMitigationPolicy(policyFixture(), lock, workspace, mitigation)).toHaveLength(
      4
    );
  });

  it('rejects missing, corrupted, count-only and wrong patch registration', () => {
    const path = policyFixture();
    write(join(path, mitigation.patchPath), 'count-only or corrupted patch');
    expect(() => assertForgeMitigationPolicy(path, lock, workspace, mitigation)).toThrow(
      'patch bytes'
    );
    rmSync(join(path, mitigation.patchPath));
    expect(() => assertForgeMitigationPolicy(path, lock, workspace, mitigation)).toThrow();
    expect(() =>
      assertForgeMitigationPolicy(
        policyFixture(),
        lock,
        { ...workspace, patchedDependencies: {} },
        mitigation
      )
    ).toThrow('registration');
  });

  it('rejects changed registry integrity and unsupported installed version policy', () => {
    const selected = structuredClone(lock);
    selected.packages['node-forge@1.4.0'].resolution.integrity = 'sha512-unreviewed';
    expect(() =>
      assertForgeMitigationPolicy(policyFixture(), selected, workspace, mitigation)
    ).toThrow('integrity');
    selected.packages['node-forge@1.4.1'] = selected.packages['node-forge@1.4.0'];
    expect(() =>
      assertForgeMitigationPolicy(policyFixture(), selected, workspace, mitigation)
    ).toThrow('version');
  });

  it('rejects patch bypass flags and an unpatched dependency reference', () => {
    for (const allowUnusedPatches of [true, 'true', 'false', null, 0, 1])
      expect(() =>
        assertForgeMitigationPolicy(
          policyFixture(),
          lock,
          { ...workspace, allowUnusedPatches },
          mitigation
        )
      ).toThrow('bypass');
    expect(() =>
      assertForgeMitigationPolicy(
        policyFixture(),
        lock,
        { ...workspace, allowUnusedPatches: false },
        mitigation
      )
    ).not.toThrow();
    const selected = structuredClone(lock);
    selected.snapshots['node-forge@1.4.0'] = {};
    selected.snapshots['@expo/code-signing-certificates@0.0.6'].dependencies['node-forge'] =
      '1.4.0';
    expect(() =>
      assertForgeMitigationPolicy(policyFixture(), selected, workspace, mitigation)
    ).toThrow('Unpatched');
  });

  it('rejects a new importer, extra path and production reachability', () => {
    const forgeVersion = `1.4.0(patch_hash=${mitigation.patchSha256})`;
    const selected = structuredClone(lock);
    selected.importers['experiments/unreviewed'] = {
      devDependencies: { 'node-forge': { version: forgeVersion } },
    };
    expect(() =>
      assertForgeMitigationPolicy(policyFixture(), selected, workspace, mitigation)
    ).toThrow('path');
    delete selected.importers['experiments/unreviewed'];
    selected.importers[CANDIDATE_DIRECTORY].devDependencies['node-forge'] = {
      version: forgeVersion,
    };
    expect(() =>
      assertForgeMitigationPolicy(policyFixture(), selected, workspace, mitigation)
    ).toThrow('path');
    selected.importers['.'].dependencies['node-forge'] = { version: forgeVersion };
    expect(() =>
      assertForgeMitigationPolicy(policyFixture(), selected, workspace, mitigation)
    ).toThrow('production');
  });
});

describe('the installed Forge reference boundary', () => {
  const emptyLock = { importers: {}, snapshots: {} };

  it('enumerates root, nested, candidate and virtual-store package contexts', () => {
    const path = fixture();
    packageFixture(join(path, 'node_modules/example'), 'example', '');
    packageFixture(join(path, 'node_modules/example/node_modules/node-forge'), 'node-forge', '');
    packageFixture(join(path, CANDIDATE_DIRECTORY, 'node_modules/second'), 'second', '');
    packageFixture(join(path, 'node_modules/.pnpm/stored/node_modules/third'), 'third', '');
    expect(
      collectForgeInstallPackages(path)
        .map(({ manifest }) => manifest.name)
        .sort()
    ).toEqual(['example', 'node-forge', 'second', 'third']);
  });

  it('rejects an installed source or package-manifest path escaping the owner', () => {
    const path = fixture();
    const foreign = fixture();
    packageFixture(foreign, 'foreign', '');
    mkdirSync(join(path, 'node_modules'), { recursive: true });
    symlinkSync(foreign, join(path, 'node_modules/foreign'));
    expect(() => collectForgeInstallPackages(path)).toThrow('escapes');
  });

  it('recognizes static import, export, require, require.resolve and import calls', () => {
    const path = fixture();
    packageFixture(
      join(path, 'node_modules/consumer'),
      'consumer',
      'import forge from "node-forge"; export {x} from "node-forge"; require("node-forge"); require.resolve("node-forge"); import("node-forge");'
    );
    expect(inspectForgeReferences(collectForgeInstallPackages(path), emptyLock)).toHaveLength(5);
  });

  it('rejects the actual fixture consumer of the unpatched dist bundle before execution', () => {
    const path = fixture();
    packageFixture(
      join(path, 'node_modules/consumer'),
      'consumer',
      'module.exports = require("node-forge/dist/forge.min.js");'
    );
    packageFixture(join(path, 'node_modules/node-forge'), 'node-forge', 'module.exports = {};');
    write(
      join(path, 'node_modules/node-forge/dist/forge.min.js'),
      'throw new Error("unpatched bundle must never execute");'
    );
    expect(() => inspectForgeReferences(collectForgeInstallPackages(path), emptyLock)).toThrow(
      'Unsupported unpatched'
    );
  });

  it('rejects a nested dist consumer, computed subpath literal and unresolved main name', () => {
    for (const source of [
      'require("node-forge/dist/forge.all.min.js")',
      'require("node-forge/" + "dist/forge.min.js")',
      'const name = "node-forge"; require(name)',
      'require("node-forge"); const name = "node-forge"; customLoader(name)',
      'require(`node-forge`)',
    ]) {
      const path = fixture();
      packageFixture(join(path, 'node_modules/parent/node_modules/consumer'), 'consumer', source);
      packageFixture(join(path, 'node_modules/parent'), 'parent', '');
      expect(() => inspectForgeReferences(collectForgeInstallPackages(path), emptyLock)).toThrow(
        /Unsupported|Unresolved/
      );
    }
  });

  it('rejects unsupported lock and installed-manifest subpath references', () => {
    expect(() =>
      inspectForgeReferences([], {
        importers: { '.': { dependencies: { 'node-forge/dist/forge.min.js': '1.4.0' } } },
        snapshots: {},
      })
    ).toThrow('subpath');
    const path = fixture();
    packageFixture(join(path, 'node_modules/consumer'), 'consumer', '');
    write(
      join(path, 'node_modules/consumer/package.json'),
      JSON.stringify({ name: 'consumer', version: '1.0.0', main: 'node-forge/dist/forge.min.js' })
    );
    expect(() => inspectForgeReferences(collectForgeInstallPackages(path), emptyLock)).toThrow(
      'subpath'
    );
  });
});

describe('every installed Forge source byte', () => {
  function byteFixture() {
    const path = fixture();
    write(join(path, 'lib/rsa.js'), 'reviewed RSA fixture');
    write(join(path, 'dist/forge.min.js'), 'unpatched registry bundle fixture');
    return {
      path,
      policy: {
        files: ['dist/forge.min.js', 'lib/rsa.js'].map((file) => {
          const bytes = readFileSync(join(path, file));
          return { path: file, bytes: bytes.length, sha256: digest(bytes) };
        }),
      },
    };
  }

  it('accepts the exact source set and rejects missing, corrupt and unpatched bytes', () => {
    const { path, policy } = byteFixture();
    expect(() => verifyInstalledForgeFiles(path, policy, digest)).not.toThrow();
    write(join(path, 'lib/rsa.js'), 'unpatched source fixture');
    expect(() => verifyInstalledForgeFiles(path, policy, digest)).toThrow('bytes differ');
    rmSync(join(path, 'lib/rsa.js'));
    expect(() => verifyInstalledForgeFiles(path, policy, digest)).toThrow('bytes differ');
  });

  it('rejects modified dist, additional files and symlinked source', () => {
    const { path, policy } = byteFixture();
    write(join(path, 'dist/forge.min.js'), 'silently modified bundle');
    expect(() => verifyInstalledForgeFiles(path, policy, digest)).toThrow('bytes differ');
    write(join(path, 'dist/forge.min.js'), 'unpatched registry bundle fixture');
    write(join(path, 'unreviewed.js'), '');
    expect(() => verifyInstalledForgeFiles(path, policy, digest)).toThrow('bytes differ');
    rmSync(join(path, 'unreviewed.js'));
    symlinkSync(join(path, 'lib/rsa.js'), join(path, 'linked.js'));
    expect(() => verifyInstalledForgeFiles(path, policy, digest)).toThrow('symlink');
  });
});

describe('actual Expo consumer entry ownership before execution', () => {
  function consumerFixture() {
    const path = fixture();
    const helper = join(path, 'node_modules/@expo/code-signing-certificates');
    const cli = join(path, 'node_modules/@expo/cli');
    write(
      join(helper, 'package.json'),
      JSON.stringify({
        name: '@expo/code-signing-certificates',
        version: '0.0.6',
        main: 'build/main.js',
      })
    );
    write(join(helper, 'build/main.js'), 'module.exports = {};');
    write(join(helper, 'build/bridge.js'), 'throw new Error("unreviewed helper bridge executed");');
    write(join(cli, 'package.json'), JSON.stringify({ name: '@expo/cli', version: '57.0.27' }));
    write(join(cli, 'build/src/utils/codesigning.js'), 'module.exports = {};');
    write(join(cli, 'build/src/run/ios/codeSigning/Security.js'), 'module.exports = {};');
    return { path, helper, cli };
  }

  it('accepts the inspected helper main and actual CLI caller context', () => {
    const { path } = consumerFixture();
    expect(() => assertForgeConsumerEntries(collectForgeInstallPackages(path))).not.toThrow();
  });

  it('rejects a same-version main bridge before package execution', () => {
    const { path, helper } = consumerFixture();
    const manifest = JSON.parse(readFileSync(join(helper, 'package.json'), 'utf8'));
    manifest.main = 'build/bridge.js';
    write(join(helper, 'package.json'), JSON.stringify(manifest));
    const packages = collectForgeInstallPackages(path);
    expect(() => assertForgeConsumerEntries(packages)).toThrow(
      'Helper default main is outside reviewed source'
    );
  });

  it('rejects a same-version exports bridge at the actual CLI dependency boundary', () => {
    const { path, helper } = consumerFixture();
    const manifest = JSON.parse(readFileSync(join(helper, 'package.json'), 'utf8'));
    manifest.exports = { '.': './build/bridge.js' };
    write(join(helper, 'package.json'), JSON.stringify(manifest));
    const packages = collectForgeInstallPackages(path);
    expect(() => assertForgeConsumerEntries(packages)).toThrow(
      'CLI helper resolution is outside inspected source'
    );
  });

  it('rejects an uninspected helper beneath the actual signing source directory', () => {
    const { path, cli } = consumerFixture();
    const nested = join(cli, 'build/src/utils/node_modules/@expo/code-signing-certificates');
    write(
      join(nested, 'package.json'),
      JSON.stringify({
        name: '@expo/code-signing-certificates',
        version: '0.0.6',
        main: 'bridge.js',
      })
    );
    write(join(nested, 'bridge.js'), 'throw new Error("uninspected helper executed");');
    const packages = collectForgeInstallPackages(path);
    expect(() => assertForgeConsumerEntries(packages)).toThrow(
      'CLI helper resolution is outside inspected source'
    );
  });
});
