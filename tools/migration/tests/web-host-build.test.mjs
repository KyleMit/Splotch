import { assertOwnedOutputIntegrity } from '../lib/web-host-artifact.mjs';
import { WEB_HOST_OUTPUT_PATHS } from '../../../migration/probes/web-host/host/contract.ts';
import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWebHostArgs } from '../build-web-host.mjs';
import {
  copySource,
  freezeSource,
  assertSourceUnchanged,
  sha256,
} from '../lib/web-host-source.mjs';
import { copyDependencies, requireFrozenDependencies } from '../lib/web-host-dependencies.mjs';
import {
  createOwnedArtifact,
  assertOwnedArtifact,
  ownedPath,
  outputParent,
} from '../lib/web-host-ownership.mjs';
import { assertControlGraphs } from '../lib/web-host-evidence.mjs';
import {
  freezeGitMetadata,
  pinBuildMetadata,
  assertPinnedBuildMetadata,
} from '../lib/web-host-metadata.mjs';
import { copiedBuildEnvironment, runCopiedChild } from '../lib/web-host-build.mjs';
import {
  assertBorrowedWitness,
  borrowedWriteWitness,
  fileInventory,
} from '../lib/web-host-files.mjs';
import { compareProductBytes } from '../lib/web-host-comparison.mjs';
import { ROOT } from '../../lib/proc.mjs';
import { PINNED_BUILD_METADATA_ENV } from '../../../web/buildVersion.ts';
import { PINNED_APP_SHELL_NONCE_ENV } from '../../../web/appShellBuildNonce.ts';

const fixtures = [];
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-web-host-test-')));
  fixtures.push(root);
  return root;
}
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true });
});

function git(root, ...args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], {
    encoding: 'utf8',
  }).trim();
}
function sourceFixture() {
  const root = fixture();
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  writeFileSync(join(root, 'app.ts'), 'export const value = 1;\n');
  git(root, 'init', '--quiet');
  git(root, 'add', '.');
  git(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'Fixture'
  );
  return {
    root,
    topologySha: git(root, 'rev-parse', 'HEAD'),
    topologyLockSha256: sha256(readFileSync(join(root, 'pnpm-lock.yaml'))),
    provisional: false,
  };
}
function dependencyFixture() {
  const root = fixture();
  const modules = join(root, 'node_modules');
  mkdirSync(join(modules, '.pnpm'), { recursive: true });
  mkdirSync(join(modules, '.bin'));
  writeFileSync(join(modules, '.pnpm/lock.yaml'), 'fixture');
  const borrowedStoreFile = join(root, 'store-file.mjs');
  writeFileSync(borrowedStoreFile, 'export const value = 1;');
  linkSync(borrowedStoreFile, join(modules, 'module.mjs'));
  symlinkSync('./module.mjs', join(modules, 'internal.mjs'));
  for (const name of ['vite', 'svelte-kit', 'tsc', 'playwright']) {
    writeFileSync(join(modules, '.bin', name), `#!/bin/sh\nNODE_PATH='${root}/node_modules'\n`);
  }
  return { root, modules };
}

it('rejects unimplemented/unknown flags and distinguishes actual artifact classes', () => {
  expect(parseWebHostArgs(['--artifact=mechanism', '--provisional']).artifact).toBe('mechanism');
  expect(parseWebHostArgs([]).artifact).toBe('release');
  expect(() => parseWebHostArgs(['--variant=neutral-embedded'])).toThrow(/Only retained-control/);
  expect(() => parseWebHostArgs(['--artfact=release'])).toThrow();
  expect(() => parseWebHostArgs(['--artifact=fast'])).toThrow(/release or mechanism/);
});

it('exports actual committed bytes independently and detects changed borrowed inputs', () => {
  const options = sourceFixture();
  const snapshot = freezeSource(options);
  const destination = join(fixture(), 'copy');
  copySource(snapshot, destination);
  expect(readFileSync(join(destination, 'app.ts'), 'utf8')).toContain('value = 1');
  expect(lstatSync(join(destination, 'app.ts')).ino).not.toBe(
    lstatSync(join(options.root, 'app.ts')).ino
  );
  assertSourceUnchanged(snapshot);
  writeFileSync(join(options.root, 'app.ts'), 'changed');
  expect(() => assertSourceUnchanged(snapshot)).toThrow(/changed/);
  expect(() => freezeSource(options)).toThrow(/clean checkout/);
  const provisional = freezeSource({ ...options, provisional: true });
  expect(provisional.provisional).toBe(true);
  expect(provisional.patchSha256).not.toBeNull();
});

it('requires real topology ancestry and the exact reviewed lock', () => {
  const options = sourceFixture();
  expect(() => freezeSource({ ...options, topologySha: undefined })).toThrow(
    /Actual reviewed topology/
  );
  expect(() => freezeSource({ ...options, topologyLockSha256: '0'.repeat(64) })).toThrow(
    /digest mismatch/
  );
  writeFileSync(join(options.root, 'pnpm-lock.yaml'), 'other lock');
  expect(() => freezeSource({ ...options, provisional: true })).toThrow(/Current lock differs/);
});

it('rejects ownership replacement, output ancestry and escaping output links', () => {
  const source = fixture();
  const parent = fixture();
  expect(outputParent(source, parent)).toBe(parent);
  expect(() => outputParent(source, source)).toThrow(/separate/);
  const owned = createOwnedArtifact(parent);
  expect(ownedPath(owned, 'control')).toBe(join(owned.root, 'control'));
  expect(() => ownedPath(owned, '../escape')).toThrow(/escapes/);
  const borrowed = join(source, 'borrowed.json');
  writeFileSync(borrowed, '{}');
  linkSync(borrowed, join(owned.root, 'borrowed-hardlink.json'));
  expect(() => ownedPath(owned, 'borrowed-hardlink.json')).toThrow(/borrowed hardlink/);
  symlinkSync(source, join(owned.root, 'escape'));
  expect(() => ownedPath(owned, 'escape/app.ts')).toThrow(/escapes/);
  writeFileSync(join(owned.root, '.splotch-web-host.json'), '{}');
  expect(() => assertOwnedArtifact(owned)).toThrow(/ownership changed/);
});

it('copies internal dependency links and relocates only owned binary shims', () => {
  const { root, modules } = dependencyFixture();
  expect(requireFrozenDependencies(root, sha256('fixture'))).toBe(modules);
  const copy = join(fixture(), 'copy');
  mkdirSync(copy);
  const receipt = copyDependencies(modules, copy);
  expect(realpathSync(join(copy, 'node_modules/internal.mjs'))).toBe(
    join(copy, 'node_modules/module.mjs')
  );
  expect(readFileSync(join(copy, 'node_modules/.bin/vite'), 'utf8')).toContain(copy);
  expect(readFileSync(join(modules, '.bin/vite'), 'utf8')).toContain(root);
  expect(receipt.adapters).toHaveLength(4);
  expect(lstatSync(join(copy, 'node_modules/module.mjs')).ino).not.toBe(
    lstatSync(join(modules, 'module.mjs')).ino
  );
  writeFileSync(join(modules, '.pnpm/lock.yaml'), 'changed');
  expect(() => requireFrozenDependencies(root, sha256('fixture'))).toThrow(/differs/);
});

it('rejects a dependency link to a borrowed outside tree', () => {
  const { modules } = dependencyFixture();
  const outside = fixture();
  symlinkSync(outside, join(modules, 'outside'));
  const copy = join(fixture(), 'copy');
  mkdirSync(copy);
  expect(() => copyDependencies(modules, copy)).toThrow(/escapes/);
});

it('uses the actual copied version owner with frozen source Git and no copied Git directory', async () => {
  const options = sourceFixture();
  git(options.root, 'tag', 'v1.6.0');
  const gitMetadata = freezeGitMetadata(freezeSource(options));
  expect(gitMetadata.tagSha).toBe(options.topologySha);
  const copy = fixture();
  mkdirSync(join(copy, 'web'));
  for (const path of [
    'web/buildVersion.ts',
    'web/appShellBuildNonce.ts',
    'tools/migration/lib/web-host-ownership.mjs',
    'migration/probes/web-host/host/contract.ts',
  ]) {
    mkdirSync(join(copy, path, '..'), { recursive: true });
    copyFileSync(join(ROOT, path), join(copy, path));
  }
  writeFileSync(join(copy, 'package.json'), '{"version":"1.6.0","type":"module"}');
  const pinned = await pinBuildMetadata(copy, gitMetadata);
  expect(pinned.metadata.appVersion).toBe('1.6.0');
  expect(() => assertPinnedBuildMetadata(pinned)).not.toThrow();
  const envKey = PINNED_BUILD_METADATA_ENV;
  expect(pinned.env[PINNED_APP_SHELL_NONCE_ENV]).toBe(pinned.appShellNonce);
  const separatelyPinned = await pinBuildMetadata(copy, gitMetadata);
  expect(separatelyPinned.appShellNonce).not.toBe(pinned.appShellNonce);
  const mismatched = {
    ...pinned,
    env: {
      ...pinned.env,
      [envKey]: JSON.stringify({ ...pinned.metadata, appVersion: 'other', isCapacitor: false }),
    },
  };
  expect(() => assertPinnedBuildMetadata(mismatched)).toThrow(/disagrees/);
  expect(() =>
    assertPinnedBuildMetadata({ ...pinned, env: { ...pinned.env, [envKey]: 'invalid' } })
  ).toThrow(/invalid/);
  expect(() =>
    assertPinnedBuildMetadata({ ...pinned, env: { ...pinned.env, NODE_PATH: '/outside' } })
  ).toThrow(/only/);
  expect(JSON.parse(pinned.env[PINNED_BUILD_METADATA_ENV]).isCapacitor).toBe(false);
  expect(() =>
    assertPinnedBuildMetadata({
      ...pinned,
      appShellNonce: 'invalid',
      env: { ...pinned.env, [PINNED_APP_SHELL_NONCE_ENV]: 'invalid' },
    })
  ).toThrow(/UUIDv4/);
  expect(() =>
    assertPinnedBuildMetadata({ ...pinned, appShellNonce: '806d050f-45b0-4419-9997-0a0065232d26' })
  ).toThrow(/only/);
  const { [PINNED_APP_SHELL_NONCE_ENV]: omitted, ...missingNonce } = pinned.env;
  expect(omitted).toBe(pinned.appShellNonce);
  expect(() => assertPinnedBuildMetadata({ ...pinned, env: missingNonce })).toThrow(/only/);
});

it('binds both retained build contexts and rejects foreign included and external UI edges', () => {
  const context = { controlRoot: '/owned/control', artifact: 'release' };
  const chunk = {
    fileName: 'app.js',
    facade: null,
    imports: ['node:fs', 'sharp', './emitted.js'],
    dynamicImports: ['./lazy.js'],
    modules: [
      'web/src/routes/+page.svelte',
      'web/src/lib/reactNotes.ts',
      'node_modules/svelte/src/index-client.js',
    ],
  };
  const passes = [true, false].map((ssr) => ({
    ssr,
    root: '/owned/control/web',
    configFile: '/owned/control/migration/probes/web-host/host/vite.config.ts',
    artifact: 'release',
    chunks: [chunk],
  }));
  expect(() => assertControlGraphs(passes, context)).not.toThrow();
  expect(() => assertControlGraphs(passes.slice(0, 1), context)).toThrow(/both/);
  for (const kind of ['modules', 'imports', 'dynamicImports']) {
    for (const id of [
      'react',
      'react/jsx-runtime',
      'react-dom/client',
      'react-native',
      'react-native-web',
      'react-strict-dom',
      '@react-native/assets-registry',
      'node_modules/react-dom/client.js',
      'node_modules/.pnpm/react@19.2.3/node_modules/react/index.js',
    ]) {
      const changed = structuredClone(passes);
      changed[0].chunks[0][kind].push(id);
      expect(() => assertControlGraphs(changed, context)).toThrow(/React\/native UI/);
    }
  }
  const candidate = structuredClone(passes);
  candidate[1].chunks[0].dynamicImports.push('migration/probes/web-host/src/ProbeChrome.tsx');
  expect(() => assertControlGraphs(candidate, context)).toThrow(/candidate UI/);
  for (const mutation of [
    (value) => {
      value[0].ssr = 'true';
    },
    (value) => {
      value[0].root = '/borrowed/web';
    },
    (value) => {
      value[0].configFile = '/owned/control/web/vite.config.ts';
    },
    (value) => {
      value[0].artifact = 'mechanism';
    },
    (value) => {
      value[0].chunks[0].imports = {};
    },
    (value) => {
      value[0].chunks[0].dynamicImports = [null];
    },
    (value) => {
      value[0].chunks[0].extra = [];
    },
  ]) {
    const changed = structuredClone(passes);
    mutation(changed);
    expect(() => assertControlGraphs(changed, context)).toThrow();
  }
});

it('reports failed copied child exits', async () => {
  const owned = createOwnedArtifact(fixture());
  const copyRoot = fixture();
  const env = copiedBuildEnvironment(owned, copyRoot, 'release', {});
  expect(env.PUBLIC_ENABLE_DEV_HARNESS).toBe('false');
  await expect(
    runCopiedChild({
      owned,
      copyRoot,
      env,
      label: 'successful-child',
      command: process.execPath,
      args: ['-e', 'process.stdout.write("control")'],
    })
  ).resolves.toMatchObject({ code: 0 });
  await expect(
    runCopiedChild({
      owned,
      copyRoot,
      env,
      label: 'failed-child',
      command: process.execPath,
      args: ['-e', 'process.exit(7)'],
    })
  ).rejects.toThrow(/failed \(7\)/);
});

it('witnesses actual child writes to a borrowed output while accepting owned writes', async () => {
  const borrowedRoot = fixture();
  const borrowedOutput = join(borrowedRoot, 'web/build/borrowed-cache.txt');
  mkdirSync(join(borrowedRoot, 'web/build'), { recursive: true });
  writeFileSync(borrowedOutput, 'original borrowed output');
  const before = borrowedWriteWitness(borrowedRoot);
  const owned = createOwnedArtifact(fixture());
  const copyRoot = join(owned.root, 'control');
  mkdirSync(copyRoot);
  const env = copiedBuildEnvironment(owned, copyRoot, 'release', {});
  await expect(
    runCopiedChild({
      owned,
      copyRoot,
      env,
      label: 'owned-output-child',
      command: process.execPath,
      args: ['-e', "require('node:fs').writeFileSync('owned-output.txt', 'owned copy output')"],
    })
  ).resolves.toMatchObject({ code: 0 });
  expect(readFileSync(join(copyRoot, 'owned-output.txt'), 'utf8')).toBe('owned copy output');
  expect(() => assertBorrowedWitness(before, borrowedWriteWitness(borrowedRoot))).not.toThrow();
  await expect(
    runCopiedChild({
      owned,
      copyRoot,
      env,
      label: 'borrowed-output-child',
      command: process.execPath,
      args: [
        '-e',
        "require('node:fs').writeFileSync(process.argv[1], 'changed borrowed output')",
        borrowedOutput,
      ],
    })
  ).resolves.toMatchObject({ code: 0 });
  expect(readFileSync(borrowedOutput, 'utf8')).toBe('changed borrowed output');
  const after = borrowedWriteWitness(borrowedRoot);
  expect(after['web/build']).not.toBe(before['web/build']);
  expect(() => assertBorrowedWitness(before, after)).toThrow(
    'Build changed borrowed checkout outputs/dependencies: web/build'
  );
});

it('copies valid source links after their targets and rejects external source links', () => {
  const options = sourceFixture();
  symlinkSync('app.ts', join(options.root, 'a-link.ts'));
  git(options.root, 'add', '.');
  git(
    options.root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'Link fixture'
  );
  const snapshot = freezeSource(options);
  const destination = join(fixture(), 'copy');
  copySource(snapshot, destination);
  expect(realpathSync(join(destination, 'a-link.ts'))).toBe(join(destination, 'app.ts'));
  const outside = join(fixture(), 'outside.ts');
  writeFileSync(outside, 'external input');
  symlinkSync(outside, join(options.root, 'external.ts'));
  expect(() => freezeSource({ ...options, provisional: true })).toThrow(/escapes the checkout/);
});

it('normalizes owned copy paths and rejects different shell nonces directly', () => {
  const referenceRoot = fixture();
  const controlRoot = fixture();
  const referenceUrl = '/?app-shell-build=reference-fixture';
  const controlUrl = referenceUrl;
  for (const [root, shell] of [
    [referenceRoot, referenceUrl],
    [controlRoot, controlUrl],
  ]) {
    mkdirSync(join(root, 'web/build'), { recursive: true });
    writeFileSync(join(root, 'web/build/sw.js'), `${root}/web/source;${shell}`);
    writeFileSync(join(root, 'web/build/app.js'), 'same app');
  }
  const inventory = (root, appShellUrl) => ({
    appShellUrl,
    outputs: { 'web/build': fileInventory(join(root, 'web/build')) },
  });
  const compare = () =>
    compareProductBytes({
      referenceRoot,
      controlRoot,
      reference: inventory(referenceRoot, referenceUrl),
      control: inventory(controlRoot, controlUrl),
    });
  expect(compare().normalized).toHaveLength(1);
  writeFileSync(join(controlRoot, 'web/build/app.js'), 'changed app');
  expect(compare).toThrow(/Unexplained/);
  writeFileSync(join(controlRoot, 'web/build/app.js'), 'same app');
  writeFileSync(
    join(controlRoot, 'web/build/sw.js'),
    `${controlRoot}/web/source;/?app-shell-build=different-pin`
  );
  expect(compare).toThrow('Unexplained retained-control product bytes differ: web/build/sw.js');
  writeFileSync(join(controlRoot, 'web/build/sw.js'), `${controlRoot}/web/source;${referenceUrl}`);
  expect(compare().normalized).toHaveLength(1);
});

it('binds an owned browser copy to its captured product bytes', () => {
  const owned = createOwnedArtifact(fixture());
  const copy = join(owned.root, 'control');
  const expected = {};
  for (const output of WEB_HOST_OUTPUT_PATHS) {
    mkdirSync(join(copy, output), { recursive: true });
    writeFileSync(join(copy, output, 'fixture.txt'), 'built bytes');
    expected[output] = fileInventory(join(copy, output));
  }
  expect(() => assertOwnedOutputIntegrity(owned, copy, expected, 'control')).not.toThrow();
  writeFileSync(join(copy, WEB_HOST_OUTPUT_PATHS[0], 'fixture.txt'), 'changed bytes');
  expect(() => assertOwnedOutputIntegrity(owned, copy, expected, 'control')).toThrow(
    /changed after capture/
  );
});

it('rejects changed product mode even when actual file bytes match', () => {
  const referenceRoot = fixture();
  const controlRoot = fixture();
  for (const root of [referenceRoot, controlRoot]) {
    mkdirSync(join(root, 'web/build'), { recursive: true });
    writeFileSync(join(root, 'web/build/app.js'), 'same app');
    chmodSync(join(root, 'web/build/app.js'), 0o644);
  }
  const inventory = (root) => ({
    appShellUrl: '/?app-shell-build=fixture',
    outputs: { 'web/build': fileInventory(join(root, 'web/build')) },
  });
  const compare = () =>
    compareProductBytes({
      referenceRoot,
      controlRoot,
      reference: inventory(referenceRoot),
      control: inventory(controlRoot),
    });
  expect(compare().normalized).toEqual([]);
  chmodSync(join(controlRoot, 'web/build/app.js'), 0o755);
  expect(inventory(referenceRoot).outputs['web/build'][0].sha256).toBe(
    inventory(controlRoot).outputs['web/build'][0].sha256
  );
  expect(compare).toThrow('Product output kind/mode differs: web/build/app.js');
});

it('checks inventory kind before accepting an identical product digest', () => {
  const referenceRoot = fixture();
  const controlRoot = fixture();
  for (const root of [referenceRoot, controlRoot]) {
    mkdirSync(join(root, 'web/build'), { recursive: true });
    writeFileSync(join(root, 'web/build/app.js'), 'same app');
  }
  const reference = {
    appShellUrl: 'fixture',
    outputs: { 'web/build': fileInventory(join(referenceRoot, 'web/build')) },
  };
  const control = {
    appShellUrl: 'fixture',
    outputs: { 'web/build': fileInventory(join(controlRoot, 'web/build')) },
  };
  expect(() =>
    compareProductBytes({ referenceRoot, controlRoot, reference, control })
  ).not.toThrow();
  control.outputs['web/build'][0].kind = 'symlink';
  expect(() => compareProductBytes({ referenceRoot, controlRoot, reference, control })).toThrow(
    'Product output kind/mode differs: web/build/app.js'
  );
});
