import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  SOURCE_REVISIONS,
  digest,
  sourceConfiguration,
  heldNamespaceConfiguration,
} from './contract.mjs';

const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const OWNER_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'capacitor.config.json',
  'web/src/lib/storageKeys.ts',
  'web/src/lib/storage.ts',
  'web/src/lib/secureStorage.ts',
  'web/src/lib/state/settings.svelte.ts',
  'web/src/app.html',
  'web/src/routes/+layout.svelte',
  'web/vite.config.ts',
  'web/svelte.config.js',
  'android/app/src/main/java/art/splotch/app/MainActivity.java',
  'android/app/src/main/java/art/splotch/app/ColoringPackWorker.java',
  'android/app/src/main/java/art/splotch/app/ColoringPacksPlugin.java',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/build.gradle',
  'android/capacitor.settings.gradle',
  'ios/App/App/MainViewController.swift',
  'ios/App/App/AppDelegate.swift',
  'ios/App/App/ColoringPacksPlugin.swift',
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/CapApp-SPM/Package.swift',
  'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
];

const HELD_OWNER_PATHS = [
  'web/src/lib/drawing/unsavedPictureStore.ts',
  'web/src/lib/saveNaming.ts',
];

const READER_BUILD_OWNER_PATHS = [
  'web/appShellBuildNonce.ts',
  'tools/migration/lib/web-host-ownership.mjs',
  'migration/probes/web-host/host/contract.ts',
];

function gitBytes(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function inspectSource(repo, role) {
  assert.ok(Object.hasOwn(SOURCE_REVISIONS, role), 'L0_SOURCE_ROLE_INVALID');
  const revision = SOURCE_REVISIONS[role];
  assert.equal(
    gitBytes(repo, ['rev-parse', `${revision}^{commit}`])
      .toString()
      .trim(),
    revision,
    'L0_SOURCE_OBJECT_MISSING'
  );
  const paths = [
    ...OWNER_PATHS,
    ...(role === 'released'
      ? []
      : [
          'android/app/src/main/java/art/splotch/app/ColoringPackStorage.java',
          ...HELD_OWNER_PATHS,
        ]),
    ...(role === 'reader' ? READER_BUILD_OWNER_PATHS : []),
  ];
  const owners = paths.map((path) => {
    const bytes = gitBytes(repo, ['show', `${revision}:${path}`]);
    const blob = gitBytes(repo, ['rev-parse', `${revision}:${path}`])
      .toString()
      .trim();
    const mode = gitBytes(repo, ['ls-tree', revision, '--', path]).toString().split(/\s+/)[0];
    assert.ok(['100644', '100755'].includes(mode), 'L0_OWNER_MODE_UNQUALIFIED');
    return { path, bytes: bytes.length, sha256: digest(bytes), blob, mode };
  });
  const read = (path) => gitBytes(repo, ['show', `${revision}:${path}`]).toString();
  const releasedStorageKeys = gitBytes(repo, [
    'show',
    `${SOURCE_REVISIONS.released}:web/src/lib/storageKeys.ts`,
  ]);
  const configuration = sourceConfiguration(
    role,
    read('web/src/lib/storageKeys.ts'),
    read('web/src/lib/secureStorage.ts'),
    releasedStorageKeys.toString()
  );
  const heldRevision = role === 'released' ? SOURCE_REVISIONS.held : revision;
  const heldOwners = HELD_OWNER_PATHS.map((path) => {
    const bytes = gitBytes(repo, ['show', `${heldRevision}:${path}`]);
    return {
      path,
      bytes: bytes.length,
      sha256: digest(bytes),
      blob: gitBytes(repo, ['rev-parse', `${heldRevision}:${path}`])
        .toString()
        .trim(),
      mode: gitBytes(repo, ['ls-tree', heldRevision, '--', path]).toString().split(/\s+/)[0],
    };
  });
  configuration.heldNamespace = heldNamespaceConfiguration(
    gitBytes(repo, ['show', `${heldRevision}:${HELD_OWNER_PATHS[0]}`]).toString()
  );
  const picturePath = 'web/static/favicon-96x96.png';
  const picture = gitBytes(repo, ['show', `${revision}:${picturePath}`]);
  configuration.picture = {
    path: picturePath,
    bytes: picture.length,
    sha256: digest(picture),
    base64: picture.toString('base64'),
  };
  owners.push({
    path: picturePath,
    bytes: picture.length,
    sha256: digest(picture),
    blob: gitBytes(repo, ['rev-parse', `${revision}:${picturePath}`])
      .toString()
      .trim(),
  });
  const nativeConfig = JSON.parse(read('capacitor.config.json'));
  assert.equal(nativeConfig.appId, 'art.splotch.app', 'L0_APPLICATION_ID_CHANGED');
  assert.deepEqual(nativeConfig.server, { androidScheme: 'https' }, 'L0_ORIGIN_INPUT_CHANGED');
  assert.equal(JSON.parse(read('package.json')).version, '1.6.0', 'L0_VERSION_SCOPE_CHANGED');
  return {
    scope: 'source inputs only; no install/native/profile or released binary acceptance',
    role,
    revision,
    tree: gitBytes(repo, ['rev-parse', `${revision}^{tree}`])
      .toString()
      .trim(),
    nativeConfig,
    configuration,
    owners,
    heldFormatOwner: {
      revision: heldRevision,
      borrowedLaterNamespace: role === 'released',
      owners: heldOwners,
    },
    releasedKeyOwner: {
      revision: SOURCE_REVISIONS.released,
      path: 'web/src/lib/storageKeys.ts',
      bytes: releasedStorageKeys.length,
      sha256: digest(releasedStorageKeys),
    },
  };
}

export function sourceTree(repo, revision) {
  return gitBytes(repo, ['ls-tree', '-rlz', '--full-tree', revision])
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('\t');
      const metadata = entry.slice(0, separator);
      const path = entry.slice(separator + 1);
      const [mode, type, blob, size] = metadata.trim().split(/\s+/);
      assert.ok(
        ['100644', '100755'].includes(mode) && type === 'blob',
        `L0_UNSUPPORTED_GIT_MEMBER: ${path}`
      );
      assert.ok(
        separator > 0 &&
          !path.startsWith('/') &&
          !path.split('/').includes('..') &&
          !/[\n\r\t]/.test(path),
        'L0_UNSAFE_GIT_PATH'
      );
      assert.ok(
        Number.isSafeInteger(Number(size)) && Number(size) >= 0,
        'L0_GIT_MEMBER_SIZE_INVALID'
      );
      assert.ok(
        !/(^|\/)(\.env|local\.xcconfig|keystore\.properties)$/.test(path),
        `L0_PRIVATE_INPUT_REFUSED: ${path}`
      );
      return { path, mode, blob, bytes: Number(size) };
    });
}
