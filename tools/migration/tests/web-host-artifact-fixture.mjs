import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { PINNED_BUILD_METADATA_ENV } from '../../../web/buildVersion.ts';
import { PINNED_APP_SHELL_NONCE_ENV } from '../../../web/appShellBuildNonce.ts';
import { appShellPrecacheUrl } from '../../../web/src/lib/pwa/appShellRoute.ts';
import {
  WEB_HOST_COPY_ROLES,
  WEB_HOST_INPUTS,
  WEB_HOST_OUTPUT_PATHS,
  WEB_HOST_RESULT,
  WEB_HOST_VARIANT,
} from '../../../migration/probes/web-host/host/contract.ts';
import { createOwnedArtifact, writeOwnedJson } from '../lib/web-host-ownership.mjs';
import { fileInventory } from '../lib/web-host-files.mjs';
import { captureInputBindings, freezeCopyInputs } from '../lib/web-host-inputs.mjs';
import { sha256 } from '../lib/web-host-source.mjs';
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
export function completedFixture(parent, { afterTypes = false, staged = false } = {}) {
  const owned = createOwnedArtifact(parent);
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
  const appShellNonce = '806d050f-45b0-4419-9997-0a0065232d26';
  const appShellUrl = appShellPrecacheUrl(appShellNonce);
  for (const role of WEB_HOST_COPY_ROLES) {
    mkdirSync(join(owned.root, role, 'web/.svelte-kit/output/client'), { recursive: true });
    writeFileSync(
      join(owned.root, role, 'web/.svelte-kit/output/client/sw.js'),
      `precacheAndRoute([{url:${JSON.stringify(appShellUrl)},revision:null}],{});`
    );
  }
  const inputs = {
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
  };
  writeOwnedJson(owned, WEB_HOST_INPUTS, inputs);
  const evidence = Object.fromEntries(
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
