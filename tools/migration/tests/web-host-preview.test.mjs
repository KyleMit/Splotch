import { afterEach, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { PINNED_BUILD_METADATA_ENV } from '../../../web/buildVersion.ts';
import { PINNED_APP_SHELL_NONCE_ENV } from '../../../web/appShellBuildNonce.ts';
import { appShellPrecacheUrl } from '../../../web/src/lib/pwa/appShellRoute.ts';
import {
  WEB_HOST_COPY_ROLES,
  WEB_HOST_ENV,
  WEB_HOST_INPUTS,
  WEB_HOST_OUTPUT_PATHS,
  WEB_HOST_RESULT,
  WEB_HOST_VARIANT,
  WEB_HOST_WRAPPER,
} from '../../../migration/probes/web-host/host/contract.ts';
import { createOwnedArtifact, writeOwnedJson } from '../lib/web-host-ownership.mjs';
import { captureInputBindings, freezeCopyInputs } from '../lib/web-host-inputs.mjs';
import { fileInventory } from '../lib/web-host-files.mjs';
import { sha256 } from '../lib/web-host-source.mjs';
import { readWebHostArtifact } from '../lib/web-host-artifact.mjs';

const roots = [];
const PREVIEW_READY_TIMEOUT_MS = 15_000;
const PREVIEW_STOP_TIMEOUT_MS = 5_000;
const PREVIEW_CONTROL_TIMEOUT_MS = 30_000;
const PREVIEW_IDLE_INTERVAL_MS = 1_000;
const FIXTURE_PORT = '38425';
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
function completedPreviewFixture() {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-preview-group-')));
  roots.push(parent);
  const owned = createOwnedArtifact(parent);
  const marker = join(owned.root, 'preview-pids.json');
  const lock = 'lockfileVersion: 9.0\n';
  const paths = [
    'package.json',
    'pnpm-lock.yaml',
    'tools/lib/proc.mjs',
    'tools/run-web-tool.mjs',
    WEB_HOST_WRAPPER,
  ];
  const body = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid, parentPid: process.ppid })); setInterval(() => {}, ${PREVIEW_IDLE_INTERVAL_MS});`;
  for (const role of WEB_HOST_COPY_ROLES) {
    const copy = join(owned.root, role);
    mkdirSync(copy);
    write(copy, 'package.json', '{"type":"module"}');
    write(copy, 'pnpm-lock.yaml', lock);
    write(copy, WEB_HOST_WRAPPER, 'export const fixture = true;');
    for (const path of ['tools/lib/proc.mjs', 'tools/run-web-tool.mjs']) {
      mkdirSync(join(copy, path, '..'), { recursive: true });
      copyFileSync(join(ROOT, path), join(copy, path));
    }
    write(
      copy,
      'node_modules/.bin/vite',
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} --input-type=commonjs -e ${shellQuote(body)}\n`
    );
    chmodSync(join(copy, 'node_modules/.bin/vite'), 0o755);
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
  const appShellNonce = '806d050f-45b0-4419-9997-0a0065232d26';
  const appShellUrl = appShellPrecacheUrl(appShellNonce);
  for (const role of WEB_HOST_COPY_ROLES) {
    write(
      join(owned.root, role),
      'web/.svelte-kit/output/client/sw.js',
      'precacheAndRoute([{url:' + JSON.stringify(appShellUrl) + ',revision:null}],{});'
    );
  }
  writeOwnedJson(owned, WEB_HOST_INPUTS, {
    artifact: 'release',
    variant: WEB_HOST_VARIANT,
    snapshot,
    bindings,
    pinned: {
      metadata,
      appShellNonce,
      env: {
        [PINNED_BUILD_METADATA_ENV]: JSON.stringify({ ...metadata, isCapacitor: false }),
        [PINNED_APP_SHELL_NONCE_ENV]: appShellNonce,
      },
    },
    copies: Object.fromEntries(WEB_HOST_COPY_ROLES.map((role) => [role, join(owned.root, role)])),
  });
  writeOwnedJson(owned, WEB_HOST_RESULT, {
    status: 'structural-build-only',
    artifact: 'release',
    sourceSha: snapshot.sha,
    topologySha: snapshot.topologySha,
    inputsSha256: sha256(readFileSync(join(owned.root, WEB_HOST_INPUTS))),
    evidence: Object.fromEntries(
      WEB_HOST_COPY_ROLES.map((role) => [
        role,
        {
          appShellUrl,
          version: { version: metadata.appVersion },
          outputs: Object.fromEntries(
            WEB_HOST_OUTPUT_PATHS.map((output) => [
              output,
              fileInventory(join(owned.root, role, output)),
            ])
          ),
        },
      ])
    ),
  });
  return { owned, marker };
}
function processIsRunning(pid) {
  const result = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  return (
    result.status === 0 && result.stdout.trim() !== '' && !result.stdout.trim().startsWith('Z')
  );
}
function stopFixtureGroup(pid) {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

it(
  'keeps the actual preview descendants inside the Playwright-owned server group',
  async ({ signal }) => {
    const fixture = completedPreviewFixture();
    expect(() => readWebHostArtifact(fixture.owned.root)).not.toThrow();
    const launcher = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=ExperimentalWarning',
        join(ROOT, 'tools/migration/serve-web-host.mjs'),
      ],
      {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CAPACITOR: 'false',
          PUBLIC_ENABLE_DEV_HARNESS: 'false',
          [WEB_HOST_ENV.artifactRoot]: fixture.owned.root,
          [WEB_HOST_ENV.port]: FIXTURE_PORT,
        },
      }
    );
    const closed = once(launcher, 'close');
    let preview;
    try {
      await expect
        .poll(() => existsSync(fixture.marker), { timeout: PREVIEW_READY_TIMEOUT_MS })
        .toBe(true);
      signal.throwIfAborted();
      preview = JSON.parse(readFileSync(fixture.marker, 'utf8'));
      expect(processIsRunning(preview.pid)).toBe(true);
      process.kill(-launcher.pid, 'SIGKILL');
      await closed;
      signal.throwIfAborted();
      await expect
        .poll(() => processIsRunning(preview.pid), { timeout: PREVIEW_STOP_TIMEOUT_MS })
        .toBe(false);
      signal.throwIfAborted();
      expect(processIsRunning(preview.parentPid)).toBe(false);
    } finally {
      stopFixtureGroup(launcher.pid);
      stopFixtureGroup(preview?.parentPid);
      await closed;
    }
  },
  PREVIEW_CONTROL_TIMEOUT_MS
);
