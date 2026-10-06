import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { PINNED_BUILD_METADATA_ENV } from '../../../web/buildVersion.ts';
import {
  WEB_HOST_COPY_ROLES,
  WEB_HOST_ENV,
  WEB_HOST_INPUTS,
  WEB_HOST_OUTPUT_PATHS,
  WEB_HOST_RESULT,
  WEB_HOST_VARIANT,
} from '../../../migration/probes/web-host/host/contract.ts';
import { createOwnedArtifact, writeOwnedJson } from '../lib/web-host-ownership.mjs';
import { fileInventory } from '../lib/web-host-files.mjs';
import {
  assertCopyInputs,
  assertFinalInputBindings,
  captureInputBindings,
  freezeCopyInputs,
  withGeneratedInputs,
} from '../lib/web-host-inputs.mjs';
import { readWebHostArtifact } from '../lib/web-host-artifact.mjs';
import {
  buildControlCopies,
  copiedBuildEnvironment,
  freshBrowserEnvironment,
} from '../lib/web-host-build.mjs';
import { stagedBuildScripts } from '../lib/web-host-generated.mjs';
import { sha256 } from '../lib/web-host-source.mjs';

const roots = [];
const CALLER_TIMEOUT_MS = 15_000;
const FIXTURE_PORT = '38425';
function temporary() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-input-guard-')));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function write(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function nodeExecutable(root, path, body) {
  write(
    root,
    path,
    `#!/bin/sh\nexec ${shellQuote(process.execPath)} --input-type=commonjs -e ${shellQuote(body)}\n`
  );
  chmodSync(join(root, path), 0o755);
}
function markerBody(marker, code) {
  return `require('node:fs').writeFileSync(${JSON.stringify(marker)}, process.env.PWTEST_CACHE_DIR || 'executed'); process.exit(${code});`;
}
function completedFixture({ afterTypes = false, staged = false } = {}) {
  const owned = createOwnedArtifact(temporary());
  const childMarker = join(owned.root, 'child-marker.txt');
  const helperMarker = join(owned.root, 'helper-marker.txt');
  const typesMarker = join(owned.root, 'types-marker.txt');
  const lifecycleMarker = join(owned.root, 'lifecycle.jsonl');
  const lifecycleBody = `require('node:fs').appendFileSync(${JSON.stringify(lifecycleMarker)}, JSON.stringify({ event: process.env.npm_lifecycle_event, script: process.env.npm_lifecycle_script, cwd: process.cwd() }) + '\\n');`;
  const scripts = {
    prebuild: `node -e ${shellQuote(lifecycleBody)}`,
    build: 'node tools/run-web-tool.mjs vite build',
    postbuild: `node -e ${shellQuote(lifecycleBody)}`,
  };
  const paths = [
    'package.json',
    'pnpm-lock.yaml',
    'tools/lib/proc.mjs',
    'tools/run-web-tool.mjs',
    'tools/check-bundle-budgets.mjs',
    'tools/check-pwa-precache.mjs',
    'migration/probes/web-host/host/vite.config.ts',
    'migration/probes/web-host/playwright.config.ts',
    'migration/probes/web-host/tests/control.spec.ts',
    'source-link.mjs',
  ];
  const lock = 'lockfileVersion: 9.0\n';
  for (const role of WEB_HOST_COPY_ROLES) {
    const copy = join(owned.root, role);
    mkdirSync(copy);
    write(copy, 'package.json', JSON.stringify({ type: 'module', ...(staged ? { scripts } : {}) }));
    write(copy, 'pnpm-lock.yaml', lock);
    for (const path of ['tools/lib/proc.mjs', 'tools/run-web-tool.mjs']) {
      mkdirSync(join(copy, path, '..'), { recursive: true });
      copyFileSync(join(ROOT, path), join(copy, path));
    }
    write(
      copy,
      'tools/check-bundle-budgets.mjs',
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(helperMarker)}, 'helper executed'); throw new Error('FIXTURE_HELPER_REACHED');`
    );
    write(copy, 'tools/check-pwa-precache.mjs', 'export const unused = true;');
    for (const path of paths.filter((path) => path.startsWith('migration/')))
      write(copy, path, 'export const fixture = true;');
    symlinkSync('tools/check-pwa-precache.mjs', join(copy, 'source-link.mjs'));
    write(copy, 'node_modules/fixture/main.cjs', 'module.exports = 1;');
    write(copy, 'node_modules/fixture/other.cjs', 'module.exports = 2;');
    symlinkSync('main.cjs', join(copy, 'node_modules/fixture/link.cjs'));
    nodeExecutable(
      copy,
      'node_modules/.bin/tsc',
      `require('node:fs').writeFileSync(${JSON.stringify(typesMarker)}, 'types executed'); ${afterTypes ? "require('node:fs').writeFileSync('../tools/check-bundle-budgets.mjs', 'throw new Error(\"CHANGED_HELPER_EXECUTED\");');" : ''}`
    );
    for (const bin of ['vite', 'playwright'])
      nodeExecutable(
        copy,
        `node_modules/.bin/${bin}`,
        staged && bin === 'vite' ? lifecycleBody : markerBody(childMarker, 23)
      );
    write(copy, 'web/.svelte-kit/tsconfig.json', '{}');
    for (const output of WEB_HOST_OUTPUT_PATHS) write(copy, `${output}/fixture.txt`, 'product');
  }
  const sourceRows = fileInventory(join(owned.root, 'control')).filter((row) =>
    paths.includes(row.path)
  );
  const snapshot = {
    sha: '1'.repeat(40),
    topologySha: '2'.repeat(40),
    lockSha256: sha256(lock),
    entries: sourceRows.map((row) => ({
      path: row.path,
      sha256: row.sha256,
      executable: !!(row.mode & 0o111),
      link: row.link,
    })),
  };
  let bindings = captureInputBindings(owned, snapshot);
  for (const role of WEB_HOST_COPY_ROLES) bindings = freezeCopyInputs(owned, bindings, role);
  const metadata = { appVersion: '1.6.0', buildTime: '2026-10-06 00:00' };
  const inputs = {
    artifact: 'release',
    variant: WEB_HOST_VARIANT,
    snapshot,
    bindings,
    pinned: {
      metadata,
      env: { [PINNED_BUILD_METADATA_ENV]: JSON.stringify({ ...metadata, isCapacitor: false }) },
    },
    copies: Object.fromEntries(WEB_HOST_COPY_ROLES.map((role) => [role, join(owned.root, role)])),
  };
  writeOwnedJson(owned, WEB_HOST_INPUTS, inputs);
  const evidence = Object.fromEntries(
    WEB_HOST_COPY_ROLES.map((role) => [
      role,
      {
        version: { version: metadata.appVersion },
        outputs: Object.fromEntries(
          WEB_HOST_OUTPUT_PATHS.map((output) => [
            output,
            fileInventory(join(owned.root, role, output)),
          ])
        ),
      },
    ])
  );
  writeOwnedJson(owned, WEB_HOST_RESULT, {
    status: 'structural-build-only',
    artifact: 'release',
    sourceSha: snapshot.sha,
    topologySha: snapshot.topologySha,
    inputsSha256: sha256(readFileSync(join(owned.root, WEB_HOST_INPUTS))),
    evidence,
  });
  return {
    owned,
    inputs,
    bindings,
    childMarker,
    helperMarker,
    typesMarker,
    lifecycleMarker,
    scripts,
  };
}
function caller(fixture, name) {
  const args = name === 'serve' ? [] : ['--artifact-root', fixture.owned.root];
  if (name === 'test') args.push('--port', FIXTURE_PORT, '--browser-registry', fixture.owned.root);
  return spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      join(ROOT, `tools/migration/${name}-web-host.mjs`),
      ...args,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: CALLER_TIMEOUT_MS,
      env: {
        ...process.env,
        CAPACITOR: 'false',
        PUBLIC_ENABLE_DEV_HARNESS: 'false',
        [WEB_HOST_ENV.artifactRoot]: fixture.owned.root,
        [WEB_HOST_ENV.port]: FIXTURE_PORT,
      },
    }
  );
}

function initialBindings(fixture) {
  return {
    ...fixture.bindings,
    roles: Object.fromEntries(
      WEB_HOST_COPY_ROLES.map((role) => [
        role,
        {
          source: fixture.bindings.roles[role].source,
          dependencies: fixture.bindings.roles[role].dependencies,
          scratchBefore: fixture.bindings.roles[role].scratchBefore,
          frozen: null,
        },
      ])
    ),
  };
}

it.each(['check', 'serve', 'test'])(
  'reaches the actual %s caller sentinel for unchanged bound inputs',
  (name) => {
    const fixture = completedFixture();
    expect(() => readWebHostArtifact(fixture.owned.root)).not.toThrow();
    const result = caller(fixture, name);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(name === 'check' ? /FIXTURE_HELPER_REACHED/ : /23/);
    expect(existsSync(name === 'check' ? fixture.helperMarker : fixture.childMarker)).toBe(true);
  }
);

const mutations = [
  [
    'runner',
    (copy) =>
      writeFileSync(
        join(copy, 'tools/run-web-tool.mjs'),
        'throw new Error("UNBOUND_RUNNER_EXECUTED");'
      ),
    /Bound source changed/,
  ],
  [
    'local helper',
    (copy) =>
      writeFileSync(join(copy, 'tools/lib/proc.mjs'), 'throw new Error("UNBOUND_LOCAL_EXECUTED");'),
    /Bound source changed/,
  ],
  [
    'config',
    (copy) =>
      writeFileSync(
        join(copy, 'migration/probes/web-host/playwright.config.ts'),
        'throw new Error("UNBOUND_CONFIG_EXECUTED");'
      ),
    /Bound source changed/,
  ],
  [
    'spec',
    (copy) =>
      writeFileSync(
        join(copy, 'migration/probes/web-host/tests/control.spec.ts'),
        'throw new Error("UNBOUND_SPEC_EXECUTED");'
      ),
    /Bound source changed/,
  ],
  [
    'package bytes',
    (copy) =>
      writeFileSync(
        join(copy, 'node_modules/fixture/main.cjs'),
        'throw new Error("UNBOUND_PACKAGE_EXECUTED");'
      ),
    /Bound dependency changed/,
  ],
  [
    'package mode',
    (copy) => chmodSync(join(copy, 'node_modules/fixture/main.cjs'), 0o755),
    /Bound dependency changed/,
  ],
  [
    'package link',
    (copy) => {
      rmSync(join(copy, 'node_modules/fixture/link.cjs'));
      symlinkSync('other.cjs', join(copy, 'node_modules/fixture/link.cjs'));
    },
    /Bound dependency changed/,
  ],
  [
    'added package',
    (copy) =>
      write(copy, 'node_modules/fixture/added.cjs', 'throw new Error("ADDED_PACKAGE_EXECUTED");'),
    /Bound dependency changed/,
  ],
  [
    'removed package',
    (copy) => rmSync(join(copy, 'node_modules/fixture/main.cjs')),
    /ENOENT|Bound dependency removed/,
  ],
];
it.each(
  WEB_HOST_COPY_ROLES.flatMap((role) =>
    ['check', 'serve', 'test'].flatMap((name) =>
      mutations.map(([label, mutate, error]) => ({ role, name, label, mutate, error }))
    )
  )
)(
  'rejects $role $label before the actual $name caller executes copied code',
  ({ role, name, mutate, error }) => {
    const fixture = completedFixture();
    mutate(join(fixture.owned.root, role));
    const result = caller(fixture, name);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(error);
    expect(existsSync(fixture.childMarker)).toBe(false);
    expect(existsSync(fixture.helperMarker)).toBe(false);
    expect(existsSync(fixture.typesMarker)).toBe(false);
  }
);

it('revalidates actual inputs after a successful type child and before helper imports', () => {
  const fixture = completedFixture({ afterTypes: true });
  const result = caller(fixture, 'check');
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Bound source changed: control\/tools\/check-bundle-budgets.mjs/);
  expect(existsSync(fixture.typesMarker)).toBe(true);
  expect(existsSync(fixture.helperMarker)).toBe(false);
  expect(result.stderr).not.toContain('CHANGED_HELPER_EXECUTED');
});

it('permits only finite generator and Vite caches before freezing Kit support and generated source', () => {
  const fixture = completedFixture();
  const initial = initialBindings(fixture);
  let generating = withGeneratedInputs(initial, ['web/generated.ts']);
  for (const role of WEB_HOST_COPY_ROLES) {
    const copy = join(fixture.owned.root, role);
    write(copy, 'web/generated.ts', 'export const generated = true;');
    write(copy, 'web/.svelte-kit/tsconfig.json', '{"generated":true}');
    write(copy, 'node_modules/.vite/deps/fixture.js', 'generated optimizer cache');
    write(copy, 'node_modules/.vite-temp/config.mjs', 'generated config');
    expect(() => assertCopyInputs(fixture.owned, generating, role)).not.toThrow();
    generating = freezeCopyInputs(fixture.owned, generating, role);
  }
  expect(() => assertFinalInputBindings(fixture.owned, generating)).not.toThrow();
  write(join(fixture.owned.root, 'control'), 'web/.svelte-kit/tsconfig.json', '{"changed":true}');
  expect(() => assertFinalInputBindings(fixture.owned, generating)).toThrow(/Kit support changed/);
});

it('protects package-internal caches and source bytes after the build boundary', () => {
  const fixture = completedFixture();
  write(
    join(fixture.owned.root, 'control'),
    'node_modules/fixture/.vite/cache.js',
    'package internal executable'
  );
  expect(() => readWebHostArtifact(fixture.owned.root)).toThrow(/Bound dependency changed/);
  const other = completedFixture();
  writeFileSync(join(other.owned.root, 'reference/tools/check-pwa-precache.mjs'), 'changed source');
  expect(() => readWebHostArtifact(other.owned.root)).toThrow(/Bound source changed/);
});

it('freezes the exact generated-source output bytes after the build boundary', () => {
  const fixture = completedFixture();
  const initial = initialBindings(fixture);
  let generating = withGeneratedInputs(initial, ['web/generated.ts']);
  for (const role of WEB_HOST_COPY_ROLES) {
    write(join(fixture.owned.root, role), 'web/generated.ts', 'export const generated = true;');
    generating = freezeCopyInputs(fixture.owned, generating, role);
  }
  expect(() => assertFinalInputBindings(fixture.owned, generating)).not.toThrow();
  write(
    join(fixture.owned.root, 'reference'),
    'web/generated.ts',
    'export const generated = false;'
  );
  expect(() => assertFinalInputBindings(fixture.owned, generating)).toThrow(
    /Bound source changed: reference\/web\/generated.ts/
  );
});

it('uses fresh empty transform caches and owned writable temporary paths while preserving HOME', () => {
  const fixture = completedFixture();
  const env = copiedBuildEnvironment(
    fixture.owned,
    fixture.inputs.copies.control,
    'release',
    fixture.inputs.pinned.env
  );
  const first = freshBrowserEnvironment(fixture.owned, env);
  writeFileSync(join(first.PWTEST_CACHE_DIR, 'cached.js'), 'stale executable cache');
  const second = freshBrowserEnvironment(fixture.owned, env);
  expect(second.PWTEST_CACHE_DIR).not.toBe(first.PWTEST_CACHE_DIR);
  expect(fileInventory(second.PWTEST_CACHE_DIR)).toEqual([]);
  expect(env.TMPDIR).toBe(join(fixture.owned.root, 'runtime/tmp'));
  expect(env.HOME).toBe(process.env.HOME);
  expect(() => readWebHostArtifact(fixture.owned.root)).not.toThrow();
});

it('keeps actual staged owner bodies and refuses newly discovered implicit lifecycle hooks', () => {
  const actual = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  expect(stagedBuildScripts(ROOT)).toEqual({
    prebuild: actual.prebuild,
    build: actual.build,
    postbuild: actual.postbuild,
  });
  const root = temporary();
  const owners = {
    prebuild: 'node prepare.mjs',
    build: 'node tools/run-web-tool.mjs vite build',
    postbuild: 'node check.mjs',
  };
  write(root, 'package.json', JSON.stringify({ scripts: owners }));
  expect(stagedBuildScripts(root)).toEqual(owners);
  for (const hook of ['preprebuild', 'postprebuild', 'prepostbuild', 'postpostbuild']) {
    write(
      root,
      'package.json',
      JSON.stringify({ scripts: { ...owners, [hook]: 'node implicit.mjs' } })
    );
    expect(() => stagedBuildScripts(root)).toThrow(new RegExp(hook));
  }
  write(
    root,
    'package.json',
    JSON.stringify({ scripts: { ...owners, build: 'node different-build.mjs' } })
  );
  expect(() => stagedBuildScripts(root)).toThrow(/direct Vite caller/);
});

it('preserves actual npm lifecycle environments while adding guards between shipping owner stages', async () => {
  const fixture = completedFixture({ staged: true });
  const initial = initialBindings(fixture);
  const result = await buildControlCopies({
    owned: fixture.owned,
    copies: fixture.inputs.copies,
    artifact: 'release',
    pinnedMetadata: fixture.inputs.pinned.env,
    bindings: initial,
  });
  const events = readFileSync(fixture.lifecycleMarker, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(events.map((event) => event.event)).toEqual([
    'prebuild',
    'build',
    'postbuild',
    'prebuild',
    'build',
    'postbuild',
  ]);
  expect(events.map((event) => event.cwd)).toEqual(
    WEB_HOST_COPY_ROLES.flatMap((role) => [
      fixture.inputs.copies[role],
      join(fixture.inputs.copies[role], 'web'),
      fixture.inputs.copies[role],
    ])
  );
  expect(events[0].script).toBe(fixture.scripts.prebuild);
  expect(events[1].script).toBe(fixture.scripts.build);
  expect(events[2].script).toBe(fixture.scripts.postbuild);
  expect(events[4].script).toBe(fixture.scripts.build);
  expect(result.children[4].args).toEqual([
    '--ignore-scripts',
    'run',
    'build',
    '--',
    '--config',
    join(fixture.inputs.copies.control, 'migration/probes/web-host/host/vite.config.ts'),
  ]);
  expect(result.scriptOwners).toEqual({ reference: fixture.scripts, control: fixture.scripts });
  expect(result.children.map((child) => child.code)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(() => assertFinalInputBindings(fixture.owned, result.bindings)).not.toThrow();
});
