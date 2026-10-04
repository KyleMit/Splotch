import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_STARTUP_JS_CSS_BYTES } from '../check-bundle-budgets.mjs';
import {
  checkEagerErrorBundle,
  eagerErrorResources,
  eagerErrorStartupBytes,
} from '../check-eager-error-bundle.mjs';

const DEFERRED_OWNERS = ['deferredIcons', 'modalDialog.svelte', 'SettingsModal', 'ParentalGate'];

// Each named deferred owner is its own chunk, reachable only through a dynamic import.
function manifest(shellName = 'shell', ownerNames = DEFERRED_OWNERS) {
  const owners = Object.fromEntries(
    ownerNames.map((name, index) => [
      `owner${index}`,
      { file: `_app/immutable/chunks/owner${index}.js`, name },
    ])
  );
  return {
    error: { file: '_app/immutable/nodes/1.hash.js', imports: ['shell'] },
    shell: {
      file: '_app/immutable/chunks/shell.js',
      name: shellName,
      imports: ['shared'],
      dynamicImports: Object.keys(owners),
      css: ['_app/immutable/assets/shell.css'],
    },
    shared: { file: '_app/immutable/chunks/shared.js', imports: ['shell'] },
    ...owners,
  };
}

function withoutOwner(owner) {
  return DEFERRED_OWNERS.filter((name) => name !== owner);
}

const temporaryDirectories = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true }));
});

function writeSizedFile(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'x'.repeat(bytes));
}

// index.html links only the shell. The shell, its CSS and the shared chunk are
// one byte each, and the error node supplies the rest of the requested union.
function writeBuild({ unionBytes = 4, shellName, ownerNames } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-eager-error-'));
  temporaryDirectories.push(root);
  const build = manifest(shellName, ownerNames);
  const clientDir = join(root, 'client');
  for (const file of [build.shell.file, ...build.shell.css, build.shared.file]) {
    writeSizedFile(join(clientDir, file), 1);
  }
  writeSizedFile(join(clientDir, build.error.file), unionBytes - 3);
  const manifestPath = join(root, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(build));
  const indexPath = join(root, 'index.html');
  writeFileSync(indexPath, `<link href="./${build.shell.file}" rel="modulepreload">`);
  return { manifestPath, clientDir, indexPath };
}

it('includes transitive static imports and CSS without following dynamic imports or cycles', () => {
  expect(eagerErrorResources(manifest())).toEqual([
    '_app/immutable/nodes/1.hash.js',
    '_app/immutable/chunks/shell.js',
    '_app/immutable/assets/shell.css',
    '_app/immutable/chunks/shared.js',
  ]);
});

it.each(DEFERRED_OWNERS)(
  'rejects %s in the root error closure even when no HTML link preloads it',
  (owner) => {
    expect(() => eagerErrorResources(manifest(owner))).toThrow(
      `Root error eagerly imports deferred owner ${owner}`
    );
  }
);

it.each(DEFERRED_OWNERS)('rejects a manifest with no chunk named %s', (owner) => {
  expect(() => eagerErrorResources(manifest('shell', withoutOwner(owner)))).toThrow(
    `Deferred owner ${owner} is not a chunk in this manifest: update DEFERRED_OWNERS or restore its lazy boundary`
  );
});

it('rejects missing dependencies and a missing root error entry', () => {
  const missing = manifest();
  delete missing.shared;
  expect(() => eagerErrorResources(missing)).toThrow('Missing root error dependency');
  expect(() => eagerErrorResources({})).toThrow('Expected one root error node');
});

it('guards the real web and native release lifecycle hooks', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  expect(scripts.postbuild).toContain('node tools/check-eager-error-bundle.mjs');
  expect(scripts['postbuild:cap']).toContain('node tools/check-eager-error-bundle.mjs --native');
});

it('counts unlinked error resources once alongside the linked files and inline CSS', () => {
  expect(eagerErrorStartupBytes(['shared.js'], ['shared.js', 'error.css'], 50, () => 100)).toBe(
    250
  );
});

it('passes a release web build whose union meets the startup byte budget', () => {
  const log = vi.fn();

  checkEagerErrorBundle({ ...writeBuild({ unionBytes: MAX_STARTUP_JS_CSS_BYTES }), env: {}, log });

  expect(log.mock.calls).toEqual([
    [
      `[eager-error] linked and error startup union ${MAX_STARTUP_JS_CSS_BYTES}/${MAX_STARTUP_JS_CSS_BYTES} bytes`,
    ],
    [
      `[eager-error] web root error adds 3 resources / ${MAX_STARTUP_JS_CSS_BYTES - 1} bytes outside the index.html links; deferred owners remain lazy`,
    ],
  ]);
});

it('rejects a release web build whose union exceeds the startup byte budget', () => {
  expect(() =>
    checkEagerErrorBundle({
      ...writeBuild({ unionBytes: MAX_STARTUP_JS_CSS_BYTES + 1 }),
      env: {},
      log: vi.fn(),
    })
  ).toThrow(
    `Linked and eager-error startup bytes ${MAX_STARTUP_JS_CSS_BYTES + 1} exceed ${MAX_STARTUP_JS_CSS_BYTES}`
  );
});

it.each([{ PERF_MARKS: 'true' }, { PUBLIC_ENABLE_DEV_HARNESS: 'true' }])(
  'only reports an instrumented web build whose union exceeds the startup byte budget: %j',
  (env) => {
    const log = vi.fn();

    checkEagerErrorBundle({
      ...writeBuild({ unionBytes: MAX_STARTUP_JS_CSS_BYTES + 1 }),
      env,
      log,
    });

    expect(log.mock.calls).toEqual([
      [
        `[eager-error] report-only: Linked and eager-error startup bytes ${MAX_STARTUP_JS_CSS_BYTES + 1} exceed ${MAX_STARTUP_JS_CSS_BYTES}`,
      ],
      [
        `[eager-error] instrumented build: the startup byte budget is report-only; linked and error startup union ${MAX_STARTUP_JS_CSS_BYTES + 1}/${MAX_STARTUP_JS_CSS_BYTES} bytes`,
      ],
      [
        `[eager-error] web root error adds 3 resources / ${MAX_STARTUP_JS_CSS_BYTES} bytes outside the index.html links; deferred owners remain lazy`,
      ],
    ]);
  }
);

it.each([
  { native: false, env: {} },
  { native: false, env: { PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' } },
  { native: true, env: {} },
  { native: true, env: { PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' } },
])('keeps both deferred-owner checks on every target and build: %j', ({ native, env }) => {
  const check = (build) => () =>
    checkEagerErrorBundle({ native, ...writeBuild(build), env, log: vi.fn() });

  expect(check({})).not.toThrow();
  expect(check({ shellName: 'SettingsModal' })).toThrow(
    'Root error eagerly imports deferred owner SettingsModal'
  );
  expect(check({ ownerNames: withoutOwner('SettingsModal') })).toThrow(
    'Deferred owner SettingsModal is not a chunk in this manifest'
  );
});
