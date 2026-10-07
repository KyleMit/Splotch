import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import {
  FIXTURE_DEBUG_SIGNING,
  digest,
  heldNamespaceConfiguration,
  sourceConfiguration,
} from '../contract.mjs';
import { materializeFixture } from '../materialize.mjs';

const extraction = vi.hoisted(() => ({
  actualParent: null,
  virtualParent: null,
  source: null,
  input: null,
  sourceModes: null,
  realArchive: false,
  archiveWithoutPermissions: false,
  noncanonicalArchiveMask: false,
  actualArchiveCommands: [],
  changedExtractedMode: null,
}));
vi.mock('node:fs', async (original) => {
  const fs = await original();
  const actualPath = (path) =>
    typeof path === 'string' &&
    extraction.virtualParent &&
    path.startsWith(`${extraction.virtualParent}/`)
      ? extraction.actualParent + path.slice(extraction.virtualParent.length)
      : path;
  return {
    ...fs,
    ...Object.fromEntries(
      [
        'chmodSync',
        'existsSync',
        'lstatSync',
        'mkdirSync',
        'readFileSync',
        'rmSync',
        'statSync',
        'writeFileSync',
      ].map((name) => [name, (path, ...args) => fs[name](actualPath(path), ...args)])
    ),
    realpathSync: (path) =>
      path === extraction.actualParent ? extraction.virtualParent : fs.realpathSync(path),
  };
});
vi.mock('../source-inputs.mjs', () => ({
  inspectSource: () => extraction.input,
  sourceTree: () =>
    [...extraction.source].map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      mode: extraction.sourceModes.get(path),
      blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    })),
}));
vi.mock('node:child_process', async (original) => {
  const childProcess = await original();
  return {
    execFileSync(command, args, options) {
      if (command === 'git') {
        if (extraction.realArchive) {
          const actualArgs = args.map((value) =>
            value.startsWith('--output=')
              ? '--output=' +
                extraction.actualParent +
                value.slice('--output='.length + extraction.virtualParent.length)
              : value
          );
          if (extraction.noncanonicalArchiveMask) {
            const maskIndex = actualArgs.indexOf('tar.umask=0022');
            if (maskIndex < 0) throw new Error('L0_TEST_ARCHIVE_MASK_OWNER_MISSING');
            actualArgs[maskIndex] = 'tar.umask=0002';
          }
          extraction.actualArchiveCommands.push([...actualArgs]);
          return childProcess.execFileSync(
            command,
            [...actualArgs, '--', ...extraction.source.keys()],
            {
              ...options,
              timeout: ARCHIVE_TEST_TIMEOUT_MS,
            }
          );
        }
        writeFileSync(
          args.find((value) => value.startsWith('--output=')).slice('--output='.length),
          'source extraction double'
        );
        return Buffer.alloc(0);
      }
      if (command !== 'tar') throw new Error(`L0_TEST_COMMAND_UNEXPECTED: ${command}`);
      const root = args[args.indexOf('-C') + 1];
      if (extraction.realArchive) {
        const actualArgs = args.map((value) =>
          value.startsWith(extraction.virtualParent + '/')
            ? extraction.actualParent + value.slice(extraction.virtualParent.length)
            : value
        );
        if (extraction.archiveWithoutPermissions) actualArgs[0] = '-xf';
        const result = childProcess.execFileSync(command, actualArgs, {
          ...options,
          timeout: ARCHIVE_TEST_TIMEOUT_MS,
        });
        if (extraction.changedExtractedMode) {
          const { path, mode } = extraction.changedExtractedMode;
          chmodSync(join(root, path), mode);
        }
        return result;
      }
      for (const [path, bytes] of extraction.source) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), bytes);
        chmodSync(join(root, path), Number.parseInt(extraction.sourceModes.get(path).slice(-3), 8));
      }
      return Buffer.alloc(0);
    },
  };
});

const ROOT = resolve(import.meta.dirname, '../../../..');
const ARCHIVE_TEST_TIMEOUT_MS = 5_000;
const GRADLE_PATH = 'android/app/build.gradle';
const ACTUAL_PATHS = [
  GRADLE_PATH,
  'android/gradlew',
  'web/browserTargets.ts',
  'android/app/src/main/java/art/splotch/app/MainActivity.java',
  'ios/App/App/MainViewController.swift',
  'ios/App/App.xcodeproj/project.pbxproj',
  'web/src/lib/drawing/unsavedPictureStore.ts',
];
function actualWebSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return actualWebSources(path);
    return entry.isFile() ? [[relative(ROOT, path), readFileSync(path)]] : [];
  });
}

const actualSource = () =>
  new Map([
    ...ACTUAL_PATHS.map((path) => [path, readFileSync(join(ROOT, path))]),
    ...actualWebSources(join(ROOT, 'web/src')),
  ]);
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function prepare(source) {
  const parent = mkdtempSync(join(tmpdir(), 'splotch-l0-debug-composition-'));
  extraction.actualParent = parent;
  extraction.virtualParent = `/private/tmp/${parent.split('/').at(-1)}`;
  extraction.source = source;
  extraction.sourceModes = new Map(
    [...source.keys()].map((path) => [
      path,
      statSync(join(ROOT, path)).mode & 0o111 ? '100755' : '100644',
    ])
  );
  const picture = readFileSync(join(ROOT, 'web/static/favicon-96x96.png'));
  const configuration = {
    ...sourceConfiguration(
      'held',
      read('web/src/lib/storageKeys.ts'),
      read('web/src/lib/secureStorage.ts'),
      readFileSync(join(import.meta.dirname, 'fixtures/released-storageKeys.ts.txt'), 'utf8')
    ),
    heldNamespace: heldNamespaceConfiguration(read('web/src/lib/drawing/unsavedPictureStore.ts')),
    picture: { bytes: picture.length, sha256: digest(picture), base64: picture.toString('base64') },
  };
  extraction.input = {
    role: 'held',
    revision: configuration.revision,
    configuration,
    nativeConfig: JSON.parse(read('capacitor.config.json')),
  };
  return (name) =>
    materializeFixture(ROOT, 'held', join(parent, `splotch-legacy-continuity-${name}`));
}

afterEach(() => {
  if (extraction.actualParent) rmSync(extraction.actualParent, { recursive: true });
  extraction.actualParent = null;
  extraction.virtualParent = null;
  extraction.source = null;
  extraction.input = null;
  extraction.sourceModes = null;
  extraction.realArchive = false;
  extraction.archiveWithoutPermissions = false;
  extraction.noncanonicalArchiveMask = false;
  extraction.actualArchiveCommands = [];
  extraction.changedExtractedMode = null;
});

function expectPrePluginRefusal(source) {
  const refusal = source.indexOf('L0_RELEASE_SIGNING_INPUT_REFUSED');
  const plugin = source.indexOf('apply plugin:');
  expect(refusal, 'L0_TEST_REFUSAL_MARKER_MISSING').toBeGreaterThanOrEqual(0);
  expect(plugin, 'L0_TEST_PLUGIN_OWNER_MISSING').toBeGreaterThanOrEqual(0);
  expect(refusal).toBeLessThan(plugin);
}

describe('actual materializer debug composition with finite source extraction doubles', () => {
  it('adds one fixture-owned debug signing block while preserving real source and creating no key', () => {
    const source = actualSource();
    const run = prepare(source);
    const receipt = run('positive');
    const composed = readFileSync(join(receipt.root, GRADLE_PATH), 'utf8');
    expect(composed.match(/^\s*debug\s*\{/gm)).toHaveLength(1);
    expect(composed).toContain(`def l0DebugKeyAlias = '${FIXTURE_DEBUG_SIGNING.alias}'`);
    expect(composed).toContain(`l0RequirePrivateFile('${FIXTURE_DEBUG_SIGNING.propertiesName}')`);
    expect(composed).toContain(`l0RequirePrivateFile('${FIXTURE_DEBUG_SIGNING.keystoreName}')`);
    expectPrePluginRefusal(composed);
    expect(receipt.overlay.find((entry) => entry.path === GRADLE_PATH).before).toBe(
      digest(source.get(GRADLE_PATH))
    );
    expect(readFileSync(join(ROOT, GRADLE_PATH))).toEqual(source.get(GRADLE_PATH));
    expect(existsSync(join(receipt.root, FIXTURE_DEBUG_SIGNING.keystoreName))).toBe(false);
    expect(existsSync(join(receipt.root, FIXTURE_DEBUG_SIGNING.propertiesName))).toBe(false);
    const copies = receipt.fixtureOwnerNamespace.ownerCopies;
    const storage = copies.filter((owner) => owner.source === 'web/src/lib/storage.ts');
    expect(storage).toHaveLength(1);
    const storageEdges = [...copies, ...receipt.fixtureOwnerNamespace.fixtureRewrites]
      .flatMap((owner) => owner.substitutions)
      .filter((edge) => edge.runtime && edge.sourceTarget === storage[0].source);
    expect(storageEdges.length).toBeGreaterThan(3);
    expect([...new Set(storageEdges.map((edge) => edge.target))]).toEqual([storage[0].target]);
  });

  it('preserves real archived source permissions under a private umask and rejects changed modes', () => {
    const run = prepare(actualSource());
    extraction.input.revision = 'HEAD';
    extraction.realArchive = true;
    const originalUmask = process.umask(0o077);
    try {
      const positive = run('private-archive-positive');
      expect(extraction.actualArchiveCommands[0].slice(0, 3)).toEqual([
        '-c',
        'tar.umask=0022',
        'archive',
      ]);
      expect(statSync(join(positive.root, 'web/browserTargets.ts')).mode & 0o777).toBe(0o644);
      expect(statSync(join(positive.root, 'android/gradlew')).mode & 0o777).toBe(0o755);
      expect(statSync(positive.root).mode & 0o777).toBe(0o700);
      expect(statSync(join(positive.root, '.splotch-l0-source.json')).mode & 0o777).toBe(0o600);

      extraction.noncanonicalArchiveMask = true;
      expect(() => run('private-archive-header-mask-changed')).toThrow(
        /L0_SOURCE_MODE_CHANGED: android\/app\/build.gradle/
      );
      extraction.noncanonicalArchiveMask = false;

      extraction.archiveWithoutPermissions = true;
      expect(() => run('private-archive-masked')).toThrow(/L0_SOURCE_MODE_CHANGED/);
      extraction.archiveWithoutPermissions = false;
      extraction.changedExtractedMode = { path: 'android/gradlew', mode: 0o700 };
      expect(() => run('private-archive-executable-changed')).toThrow(
        /L0_SOURCE_MODE_CHANGED: android\/gradlew/
      );
      extraction.changedExtractedMode = null;
      const restored = run('private-archive-restored');
      expect(statSync(join(restored.root, 'web/browserTargets.ts')).mode & 0o777).toBe(0o644);
      expect(statSync(join(restored.root, 'android/gradlew')).mode & 0o777).toBe(0o755);
    } finally {
      process.umask(originalUmask);
    }
  });

  it('refuses a missing guard in its ordering assertion and restores actual composition', () => {
    const run = prepare(actualSource());
    const receipt = run('assertion-integrity');
    const composed = readFileSync(join(receipt.root, GRADLE_PATH), 'utf8');
    const missing = composed.replace('L0_RELEASE_SIGNING_INPUT_REFUSED', 'L0_TEST_REMOVED_GUARD');
    expect(() => expectPrePluginRefusal(missing)).toThrow(/L0_TEST_REFUSAL_MARKER_MISSING/);
    expectPrePluginRefusal(composed);
  });

  it.each([
    [
      'missing anchor',
      (text) => text.replace('    signingConfigs {\n', '    foreignSigning {\n'),
      /L0_OWNER_ANCHOR_CHANGED/,
    ],
    ['duplicate anchor', (text) => text + '\n    signingConfigs {\n', /L0_OWNER_ANCHOR_CHANGED/],
    ['existing debug owner', (text) => text + '\n    debug {\n', /L0_FIXTURE_DEBUG_OWNER_CHANGED/],
    [
      'existing debug assignment',
      (text) => text + '\nsigningConfigs.debug\n',
      /L0_FIXTURE_DEBUG_OWNER_CHANGED/,
    ],
  ])('refuses %s and restores the actual Gradle owner', (_name, change, reason) => {
    const source = actualSource();
    const original = source.get(GRADLE_PATH);
    source.set(GRADLE_PATH, Buffer.from(change(original.toString())));
    const run = prepare(source);
    expect(() => run('rejecting')).toThrow(reason);
    source.set(GRADLE_PATH, original);
    const restored = run('restored');
    expect(readFileSync(join(restored.root, GRADLE_PATH), 'utf8')).toContain(
      'storeFile l0DebugKeyFile'
    );
    expect(readFileSync(join(ROOT, GRADLE_PATH))).toEqual(original);
  });
});
