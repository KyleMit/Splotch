// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  appShellBuildNonce,
  assertAppShellBuildNonce,
  PINNED_APP_SHELL_NONCE_ENV,
} from './appShellBuildNonce';
import { createOwnedArtifact } from '../tools/migration/lib/web-host-ownership.mjs';
import {
  WEB_HOST_ENV,
  WEB_HOST_MARKER,
  WEB_HOST_VARIANT,
} from '../migration/probes/web-host/host/contract.ts';

const FIXTURE_NONCE = '806d050f-45b0-4419-9997-0a0065232d26';
const CALL_TIMEOUT_MS = 10_000;
const roots: string[] = [];
const SOURCE_ROOT = join(import.meta.dirname, '..');
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-shell-nonce-')));
  roots.push(root);
  return root;
}
function invoke(moduleRoot: string, env: Record<string, string | undefined>, cwd = moduleRoot) {
  const url = pathToFileURL(join(moduleRoot, 'web/appShellBuildNonce.ts')).href;
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { appShellBuildNonce } from ${JSON.stringify(url)};
      const env = JSON.parse(process.argv[1]);
      try { console.log(JSON.stringify({ nonce: appShellBuildNonce({ env }), env })); }
      catch (error) { console.error(error.message); process.exitCode = 1; }`,
      JSON.stringify(env),
    ],
    { cwd, encoding: 'utf8', timeout: CALL_TIMEOUT_MS }
  );
}
function ownedFixture() {
  const owned = createOwnedArtifact(temporary());
  const copy = join(owned.root, 'control');
  for (const path of [
    'web/appShellBuildNonce.ts',
    'tools/migration/lib/web-host-ownership.mjs',
    'migration/probes/web-host/host/contract.ts',
  ]) {
    const target = join(copy, path);
    mkdirSync(join(target, '..'), { recursive: true });
    copyFileSync(join(SOURCE_ROOT, path), target);
  }
  const env = {
    [PINNED_APP_SHELL_NONCE_ENV]: FIXTURE_NONCE,
    [WEB_HOST_ENV.variant]: WEB_HOST_VARIANT,
    [WEB_HOST_ENV.artifact]: 'release',
    [WEB_HOST_ENV.artifactRoot]: owned.root,
    [WEB_HOST_ENV.copyRoot]: copy,
    [WEB_HOST_ENV.token]: owned.token,
    CAPACITOR: 'false',
    PERF_MARKS: 'false',
    PUBLIC_ENABLE_DEV_HARNESS: 'false',
  };
  return { owned, copy, env };
}
it('keeps ordinary nonce derivation read-only and fresh across separate owner evaluations', () => {
  const first = invoke(SOURCE_ROOT, {});
  const second = invoke(SOURCE_ROOT, {});
  expect(first.status).toBe(0);
  expect(second.status).toBe(0);
  const left = JSON.parse(first.stdout);
  const right = JSON.parse(second.stdout);
  expect(() => assertAppShellBuildNonce(left.nonce)).not.toThrow();
  expect(() => assertAppShellBuildNonce(right.nonce)).not.toThrow();
  expect(left.nonce).not.toBe(right.nonce);
  expect(left.env).toEqual({});
  expect(right.env).toEqual({});
});
it.each([
  '',
  'nonce',
  FIXTURE_NONCE.toUpperCase(),
  '806d050f-45b0-1419-9997-0a0065232d26',
  '806d050f-45b0-4419-0997-0a0065232d26',
])('rejects a noncanonical or invalid UUID input %s', (pin) => {
  expect(() => appShellBuildNonce({ env: { [PINNED_APP_SHELL_NONCE_ENV]: pin } })).toThrow(
    /canonical UUIDv4/
  );
});
it('honors the pin only inside the real marked copy and leaves its environment unchanged', () => {
  const { copy, env } = ownedFixture();
  for (const cwd of [copy, join(copy, 'web')]) {
    const result = invoke(copy, env, cwd);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ nonce: FIXTURE_NONCE, env });
  }
  const outside = invoke(SOURCE_ROOT, env);
  expect(outside.status).toBe(1);
  expect(outside.stderr).toContain('outside its owned paired web build');
});
it('rejects missing, malformed and foreign ownership context before deriving a nonce', () => {
  const { copy, env, owned } = ownedFixture();
  for (const field of [
    WEB_HOST_ENV.variant,
    WEB_HOST_ENV.artifact,
    WEB_HOST_ENV.artifactRoot,
    WEB_HOST_ENV.copyRoot,
    WEB_HOST_ENV.token,
  ]) {
    const incomplete: Record<string, string | undefined> = { ...env };
    delete incomplete[field];
    const result = invoke(copy, incomplete);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('complete owned paired-control context');
  }
  for (const changes of [
    { [WEB_HOST_ENV.variant]: 'neutral-embedded' },
    { [WEB_HOST_ENV.artifact]: 'unreleased' },
    { [WEB_HOST_ENV.token]: 'foreign-token' },
    { CAPACITOR: 'true' },
    { PERF_MARKS: 'true' },
    { PUBLIC_ENABLE_DEV_HARNESS: 'true' },
  ])
    expect(invoke(copy, { ...env, ...changes }).status).toBe(1);
  const marker = join(owned.root, WEB_HOST_MARKER);
  const bytes = readFileSync(marker);
  writeFileSync(marker, JSON.stringify({ root: owned.root, token: 'replaced-token' }));
  expect(invoke(copy, env).stderr).toContain('ownership changed');
  writeFileSync(marker, bytes);
  expect(invoke(copy, env).status).toBe(0);
});
