import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from './contract.mjs';

export function installedAPKPath(bytes) {
  const lines = bytes
    .toString()
    .replace(/\r?\n$/, '')
    .split(/\r?\n/);
  assert.equal(lines.length, 1, 'L0_SPLIT_APK_UNQUALIFIED');
  assert.match(
    lines[0],
    /^package:\/data\/app\/[a-zA-Z0-9_./=+~-]+\/base\.apk$/,
    'L0_INSTALLED_APK_PATH_INVALID'
  );
  const path = lines[0].slice('package:'.length);
  assert.ok(
    !path.split('/').some((part, index) => index !== 0 && ['', '.', '..'].includes(part)),
    'L0_INSTALLED_APK_PATH_INVALID'
  );
  const directories = path.slice('/data/app/'.length, -'/base.apk'.length).split('/');
  assert.ok(
    directories.length === 1 || directories.length === 2,
    'L0_INSTALLED_APK_LAYOUT_UNQUALIFIED'
  );
  assert.match(
    directories.at(-1),
    /^art\.splotch\.app-[a-zA-Z0-9_=+-]+$/,
    'L0_INSTALLED_APK_PACKAGE_INVALID'
  );
  if (directories.length === 2)
    assert.match(directories[0], /^~~[a-zA-Z0-9_=+-]+$/, 'L0_INSTALLED_APK_LAYOUT_UNQUALIFIED');
  return path;
}

export function coloringRootInventory(bytes) {
  const text = bytes.toString();
  if (text === 'L0_COLORING_ROOT_ABSENT\n') return { stage: 'post-attach', root: 'absent' };
  assert.ok(text.startsWith('L0_COLORING_ROOT_PRESENT\n'), 'L0_COLORING_ROOT_MARKER_INVALID');
  assert.equal(text, 'L0_COLORING_ROOT_PRESENT\n', 'L0A_PACK_OR_JOB_PRESENT');
  return { stage: 'post-attach', root: 'present-empty' };
}

export function androidProvider(context, bytes) {
  const policy = readFileSync(join(context.fixtureRoot, 'web/browserTargets.ts'));
  assert.equal(digest(policy), context.lease.browserTargetsSha256, 'L0_BROWSER_TARGETS_CHANGED');
  const declaration = policy.toString().match(/export const BROWSER_TARGETS = \[([^\]]+)\]/);
  assert.ok(declaration, 'L0_BROWSER_TARGETS_DECLARATION_INVALID');
  const targets = [...declaration[1].matchAll(/['"]chrome(\d+)['"]/g)];
  assert.equal(targets.length, 1, 'L0_CHROMIUM_FLOOR_UNQUALIFIED');
  const minimumChromiumMajor = Number(targets[0][1]);
  const matches = [
    ...bytes
      .toString()
      .matchAll(
        /Current WebView package \(name, version\): \(([a-zA-Z0-9_.]+), ([0-9]+(?:\.[0-9]+)+)\)/g
      ),
  ];
  assert.equal(matches.length, 1, 'L0_WEBVIEW_PROVIDER_UNQUALIFIED');
  const [, packageName, version] = matches[0];
  assert.ok(Number(version.split('.')[0]) >= minimumChromiumMajor, 'L0_WEBVIEW_BELOW_SOURCE_FLOOR');
  return { packageName, version, minimumChromiumMajor, browserTargetsSha256: digest(policy) };
}

export function verifyChromiumProvider(provider, reply) {
  assert.ok(reply && typeof reply.product === 'string', 'L0_CHROMIUM_VERSION_UNQUALIFIED');
  const product = /^(?:Chrome|Chromium|Android WebView)\/([0-9]+(?:\.[0-9]+)+)$/.exec(
    reply.product
  );
  assert.ok(product, 'L0_CHROMIUM_PRODUCT_UNQUALIFIED');
  const major = Number(product[1].split('.')[0]);
  assert.ok(major >= provider.minimumChromiumMajor, 'L0_CHROMIUM_BELOW_SOURCE_FLOOR');
  assert.equal(major, Number(provider.version.split('.')[0]), 'L0_CHROMIUM_PROVIDER_CHANGED');
}
