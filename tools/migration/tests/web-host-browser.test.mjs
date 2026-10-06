import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
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
import {
  assertBrowserRegistry,
  browserRegistryEvidence,
  browserInvocationPaths,
  createBrowserInvocation,
  requireBrowserRegistry,
  withBrowserRegistry,
} from '../lib/web-host-browser.mjs';
import { createOwnedArtifact, writeOwnedJson } from '../lib/web-host-ownership.mjs';
import { captureInputBindings, freezeCopyInputs } from '../lib/web-host-inputs.mjs';
import { fileInventory } from '../lib/web-host-files.mjs';
import { sha256 } from '../lib/web-host-source.mjs';

const roots = [];
const FIXTURE_PORT = '38425';
const CALLER_TIMEOUT_MS = 15_000;
function temporary() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-browser-registry-')));
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
function completedFixture(exitCode) {
  const owned = createOwnedArtifact(temporary());
  const registry = join(owned.root, '.cache/ms-playwright');
  mkdirSync(registry, { recursive: true });
  const marker = join(owned.root, 'browser-child.json');
  const lock = 'lockfileVersion: 9.0\n';
  const paths = ['package.json', 'pnpm-lock.yaml', 'tools/lib/proc.mjs', 'tools/run-web-tool.mjs'];
  const body = `
const fs = require('node:fs');
const path = require('node:path');
const label = process.env[${JSON.stringify(WEB_HOST_ENV.browserRun)}];
const root = process.env[${JSON.stringify(WEB_HOST_ENV.artifactRoot)}];
for (const [parent, name] of [['browser-results', 'fixture.png'], ['browser-report', 'index.html']])
  fs.writeFileSync(path.join(root, parent, label, name), label);
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ registry: process.env.PLAYWRIGHT_BROWSERS_PATH, browserRun: label, executable: process.env.PLAYWRIGHT_CHROMIUM ?? null, temporary: process.env.TMPDIR, xdg: process.env.XDG_CACHE_HOME, transform: process.env.PWTEST_CACHE_DIR, loader: process.env.NODE_OPTIONS ?? null, nodePath: process.env.NODE_PATH ?? null }));
process.exit(${exitCode});`;

  for (const role of WEB_HOST_COPY_ROLES) {
    const copy = join(owned.root, role);
    mkdirSync(copy);
    write(copy, 'package.json', '{"type":"module"}');
    write(copy, 'pnpm-lock.yaml', lock);
    for (const path of paths.filter((path) => path.startsWith('tools/'))) {
      mkdirSync(join(copy, path, '..'), { recursive: true });
      copyFileSync(join(ROOT, path), join(copy, path));
    }
    write(
      copy,
      'node_modules/.bin/playwright',
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} --input-type=commonjs -e ${shellQuote(body)}\n`
    );
    chmodSync(join(copy, 'node_modules/.bin/playwright'), 0o755);
    write(copy, 'web/.svelte-kit/tsconfig.json', '{}');
    for (const output of WEB_HOST_OUTPUT_PATHS) write(copy, `${output}/fixture.txt`, 'product');
  }
  const snapshot = {
    sha: '1'.repeat(40),
    topologySha: '2'.repeat(40),
    lockSha256: sha256(lock),
    entries: fileInventory(join(owned.root, 'control'))
      .filter((row) => paths.includes(row.path))
      .map((row) => ({
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
  return { owned, registry, marker };
}
function actualCaller(fixture, requested) {
  const args = ['--artifact-root', fixture.owned.root, '--port', FIXTURE_PORT];
  if (requested !== undefined) args.push('--browser-registry', requested);
  return spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      join(ROOT, 'tools/migration/test-web-host.mjs'),
      ...args,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: CALLER_TIMEOUT_MS,
      env: {
        ...process.env,
        NODE_OPTIONS: '--trace-warnings',
        NODE_PATH: '/untrusted-loader',
        PWTEST_CACHE_DIR: '/untrusted-transform',
        PLAYWRIGHT_BROWSERS_PATH: '/wrong-registry',
        PLAYWRIGHT_CHROMIUM: '/wrong-full-chromium',
      },
    }
  );
}

it('binds an explicit existing registry without changing ordinary executable selection', () => {
  const root = temporary();
  const registry = requireBrowserRegistry(root);
  expect(registry.path).toBe(root);
  expect(withBrowserRegistry({ XDG_CACHE_HOME: '/owned-cache' }, registry)).toEqual({
    XDG_CACHE_HOME: '/owned-cache',
    PLAYWRIGHT_BROWSERS_PATH: root,
  });
  expect(browserRegistryEvidence(registry)).toEqual({
    ...registry,
    standardHostValidationMayWrite: 'DEPENDENCIES_VALIDATED',
  });
  expect(() => assertBrowserRegistry(registry)).not.toThrow();
});
it.each([undefined, '0', 'relative-registry', '~/browser-cache', 'cache; touch outside'])(
  'rejects an unresolved registry input %s',
  (value) => {
    expect(() => requireBrowserRegistry(value)).toThrow(/existing absolute installed registry/);
  }
);
it('rejects missing and linked registry directories', () => {
  const root = temporary();
  const target = join(root, 'registry');
  mkdirSync(target);
  symlinkSync(target, join(root, 'linked'));
  expect(() => requireBrowserRegistry(join(root, 'missing'))).toThrow(/ENOENT/);
  expect(() => requireBrowserRegistry(join(root, 'linked'))).toThrow(/not a link/);
});
it.each(['replacement', 'link', 'mode'])('detects registry %s after valid setup', (mutation) => {
  const root = temporary();
  const path = join(root, 'registry');
  mkdirSync(path);
  const registry = requireBrowserRegistry(path);
  expect(() => assertBrowserRegistry(registry)).not.toThrow();
  renameSync(path, join(root, 'original'));
  if (mutation === 'link') symlinkSync(join(root, 'original'), path);
  else if (mutation === 'replacement') mkdirSync(path);
  else {
    renameSync(join(root, 'original'), path);
    chmodSync(path, registry.mode ^ 0o100);
  }
  expect(() => assertBrowserRegistry(registry)).toThrow(/Browser registry changed/);
});
it.each([0, 23])(
  'records the actual browser child exit %s with explicit CI-style registry and owned caches',
  (code) => {
    const fixture = completedFixture(code);
    const result = actualCaller(fixture, fixture.registry);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(code === 0 ? 0 : 1);
    const child = JSON.parse(readFileSync(fixture.marker, 'utf8'));
    expect(child.registry).toBe(fixture.registry);
    expect(child.executable).toBeNull();
    expect(child.temporary).toBe(join(fixture.owned.root, 'runtime/tmp'));
    expect(child.xdg).toBe(join(fixture.owned.root, 'runtime/cache'));
    expect(
      child.transform.startsWith(join(fixture.owned.root, 'runtime/cache/playwright-transform-'))
    ).toBe(true);
    expect(child.loader).toBeNull();
    expect(child.nodePath).toBeNull();
    expect(fileInventory(child.transform)).toEqual([]);
    const path = readdirSync(join(fixture.owned.root, 'controls')).find((name) =>
      name.endsWith('.json')
    );
    const record = JSON.parse(readFileSync(join(fixture.owned.root, 'controls', path), 'utf8'));
    expect(record.code).toBe(code);
    expect(record.browserInvocation).toEqual(
      browserInvocationPaths(fixture.owned, child.browserRun)
    );
    expect(record.label).toBe(child.browserRun);
    expect(record.borrowedBrowserRegistry).toEqual(
      browserRegistryEvidence(requireBrowserRegistry(fixture.registry))
    );
    expect(record.ownedRuntime.TMPDIR).toBe(child.temporary);
    expect(record.ownedRuntime.PWTEST_CACHE_DIR).toBe(child.transform);
  }
);
it.each([undefined, '0', 'relative-registry', '~/cache', 'cache; touch outside'])(
  'rejects unresolved %s before the actual copied child',
  (requested) => {
    const fixture = completedFixture(0);
    const result = actualCaller(fixture, requested);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/existing absolute installed registry/);
    expect(existsSync(fixture.marker)).toBe(false);
  }
);
it('rejects a missing registry before the actual copied child', () => {
  const fixture = completedFixture(0);
  const result = actualCaller(fixture, join(fixture.owned.root, 'missing'));
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/ENOENT/);
  expect(existsSync(fixture.marker)).toBe(false);
});
it('rejects changed copied source before registry discovery or copied execution', () => {
  const fixture = completedFixture(0);
  writeFileSync(
    join(fixture.owned.root, 'reference/tools/run-web-tool.mjs'),
    'throw new Error("UNBOUND_EXECUTED");'
  );
  const result = actualCaller(fixture, fixture.registry);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Bound source changed/);
  expect(existsSync(fixture.marker)).toBe(false);
});

it('rejects an absolute shell-fragment registry without executing it', () => {
  const fixture = completedFixture(0);
  const outside = join(fixture.owned.root, 'outside-injection-marker');
  const result = actualCaller(fixture, `${fixture.registry}; touch ${shellQuote(outside)}`);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/ENOENT/);
  expect(existsSync(fixture.marker)).toBe(false);
  expect(existsSync(outside)).toBe(false);
});

it('allocates separate evidence paths and rejects missing or malformed invocation labels', () => {
  const owned = createOwnedArtifact(temporary());
  const first = createBrowserInvocation(owned);
  const second = createBrowserInvocation(owned);
  expect(first.label).not.toBe(second.label);
  expect(browserInvocationPaths(owned, first.label)).toEqual(first);
  expect(existsSync(first.outputDir)).toBe(true);
  expect(existsSync(first.reportDir)).toBe(true);
  for (const value of [undefined, '', 'browser-control-../outside', 'browser-control-fixed'])
    expect(() => browserInvocationPaths(owned, value)).toThrow(/explicit per-invocation label/);
});

it.each([0, 23])('preserves both actual caller evidence sets when exit %s is repeated', (code) => {
  const fixture = completedFixture(code);
  const first = actualCaller(fixture, fixture.registry);
  expect(first.error).toBeUndefined();
  expect(first.status).toBe(code === 0 ? 0 : 1);
  const firstChild = JSON.parse(readFileSync(fixture.marker, 'utf8'));
  const firstPaths = browserInvocationPaths(fixture.owned, firstChild.browserRun);
  const firstFiles = [
    join(firstPaths.outputDir, 'fixture.png'),
    join(firstPaths.reportDir, 'index.html'),
  ];
  const firstBytes = firstFiles.map((path) => readFileSync(path));
  const second = actualCaller(fixture, fixture.registry);
  expect(second.error).toBeUndefined();
  expect(second.status).toBe(code === 0 ? 0 : 1);
  const secondChild = JSON.parse(readFileSync(fixture.marker, 'utf8'));
  const secondPaths = browserInvocationPaths(fixture.owned, secondChild.browserRun);
  expect(secondPaths.label).not.toBe(firstPaths.label);
  expect(firstFiles.map((path) => readFileSync(path))).toEqual(firstBytes);
  expect(readFileSync(join(secondPaths.outputDir, 'fixture.png'), 'utf8')).toBe(secondPaths.label);
  expect(readFileSync(join(secondPaths.reportDir, 'index.html'), 'utf8')).toBe(secondPaths.label);
  const records = readdirSync(join(fixture.owned.root, 'controls')).filter((name) =>
    name.endsWith('.json')
  );
  expect(records).toHaveLength(2);
  const invocations = records.map(
    (name) =>
      JSON.parse(readFileSync(join(fixture.owned.root, 'controls', name), 'utf8')).browserInvocation
        .label
  );
  expect(invocations.sort()).toEqual([firstPaths.label, secondPaths.label].sort());
});
