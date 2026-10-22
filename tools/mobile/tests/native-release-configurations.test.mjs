import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { jobBlock, jobBlocks, stepBlock } from '../../ci-mirror/tests/workflow-job-steps.mjs';
import {
  RELEASE_SIMULATOR_APP,
  STORE_GRADLE_PROPERTY,
  STORE_XCCONFIG,
  TARGETS,
} from '../../release/build-native-release.mjs';
import { ANDROID_PROJECT_DIR, RELEASE_APK, STORE_APP_ID } from '../../release/lib/native-app.mjs';
import { SKIP_BUILD_FLAG } from '../ios/run-simulator-smoke-test.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const androidWorkflow = read('.github/workflows/android-deploy.yml');
const iosWorkflow = read('.github/workflows/ios-deploy.yml');
const iosSmokeJob = jobBlock(iosWorkflow, 'smoke');
const iosSmokeRunner = read('tools/mobile/ios/run-simulator-smoke-test.mjs');
const nativeCompileWorkflow = read('.github/workflows/native-compile.yml');
const stepArgs = ({ steps }) => steps.flatMap(({ args }) => args);

// What `pnpm install` reads. pnpm-workspace.yaml's settings and patches/ decide
// what lands in node_modules, which both native builds compile from, and
// editing either need not touch the lockfile.
const PNPM_INSTALL_INPUTS = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
const PNPM_PATCHES = 'patches';

const APP_BUILD_PATHS = [
  'src',
  'android',
  'ios',
  'assets',
  'app.json',
  'babel.config.cjs',
  'metro.config.cjs',
  'postcss.config.mjs',
  'tsconfig.json',
];

const nativeCompilePathLists = () =>
  nativeCompileWorkflow
    .split(/^ {4}paths:\n/m)
    .slice(1)
    .map((block) => block.match(/^(?: {6}- .+\n)+/)[0]);

/** GitHub's path-filter globs: `**` crosses directories, `*` does not, `!` excludes. */
export function pathFilter(globs) {
  const rules = globs.map((glob) => {
    const exclude = glob.startsWith('!');
    const pattern = glob
      .slice(exclude ? 1 : 0)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\/|\*\*|\*/g, (stars) =>
        stars === '**/' ? '(?:.*/)?' : stars === '**' ? '.*' : '[^/]*'
      );
    return { exclude, regex: new RegExp(`^${pattern}$`) };
  });
  // A later rule overrides an earlier one, as GitHub evaluates the list.
  return (path) =>
    rules.reduce((matched, { exclude, regex }) => (regex.test(path) ? !exclude : matched), false);
}

const nativeCompileFilter = () =>
  pathFilter([...nativeCompilePathLists()[0].matchAll(/^ {6}- '([^']+)'$/gm)].map(([, g]) => g));

/** tools/ scripts named by the npm scripts the workflow runs, with every `npm run` expanded. */
function nativeCompileToolEntryPoints() {
  const expand = (name, seen) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const body = packageJson.scripts[name];
    return [
      ...[...body.matchAll(/\b(tools\/[\w./-]+\.mjs)/g)].map(([, path]) => path),
      ...[...body.matchAll(/npm run ([\w:-]+)/g)].flatMap(([, child]) => expand(child, seen)),
    ];
  };
  const seen = new Set();
  return [...nativeCompileWorkflow.matchAll(/^ +run: npm run ([\w:-]+)$/gm)].flatMap(([, script]) =>
    expand(script, seen)
  );
}

function localImportClosure(entryPoints) {
  const visited = new Set();
  const queue = [...entryPoints];
  while (queue.length > 0) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = read(file);
    for (const [, spec] of source.matchAll(/\b(?:from|import)\s*\(?\s*'(\.[^']*\.mjs)'/g)) {
      queue.push(relative(repoRoot, resolve(repoRoot, dirname(file), spec)));
    }
  }
  return [...visited];
}

const IMPORT_SPECIFIER =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](\.[^'"]+)['"]/g;
const SOURCE_FILE = /\.(?:[cm]?js|tsx?)$/;
// Expo's Metro source extensions, in its order. Both native builds bundle, so
// an import counts once per platform.
const METRO_SOURCE_EXTENSIONS = ['ts', 'tsx', 'mjs', 'js', 'jsx', 'json', 'cjs'];
const NATIVE_PLATFORMS = ['ios', 'android'];

/** The files Metro tries for `base` on `platform`, in its order: platform, then native, then plain. */
export function metroCandidates(base, platform) {
  const suffixes = METRO_SOURCE_EXTENSIONS.flatMap((extension) => [
    `.${platform}.${extension}`,
    `.native.${extension}`,
    `.${extension}`,
  ]);
  return [
    base,
    ...suffixes.map((suffix) => `${base}${suffix}`),
    ...suffixes.map((suffix) => `${base}/index${suffix}`),
  ];
}

const isRepoFile = (path) => {
  try {
    return statSync(join(repoRoot, path)).isFile();
  } catch {
    return false;
  }
};

/**
 * The module each native build bundles for a relative specifier, deduplicated; the unresolved
 * path when neither platform finds a file, so a broken import still reaches the coverage check.
 */
export function resolveNativeTargets(fromFile, specifier, exists = isRepoFile) {
  const base = join(dirname(fromFile), specifier);
  const targets = NATIVE_PLATFORMS.map((platform) =>
    metroCandidates(base, platform).find((candidate) => exists(candidate))
  );
  return [...new Set(targets.map((target) => target ?? base))];
}

/** Repo paths outside the app that its tracked sources import, with the importer of each. */
export function appExternalImports(appFiles) {
  return appFiles
    .filter((file) => SOURCE_FILE.test(file) && !/\.test\./.test(file))
    .flatMap((file) =>
      [...read(file).matchAll(IMPORT_SPECIFIER)].flatMap(([, specifier]) =>
        resolveNativeTargets(file, specifier).map((target) => ({ file, target }))
      )
    )
    .filter(({ target }) => !target.startsWith('src/'));
}

const trackedFiles = (...paths) =>
  execFileSync('git', ['ls-files', '--', ...paths], { cwd: repoRoot, encoding: 'utf8' })
    .trim()
    .split('\n');

describe('native release configuration gates', () => {
  it('builds and boots a test-signed store-identity Android Release APK', () => {
    expect(packageJson.scripts['android:apk:store']).toBe(
      'node tools/release/build-native-release.mjs store-apk'
    );
    const target = TARGETS['store-apk'];
    expect(target.appId).toBe(STORE_APP_ID);
    expect(target.artifact).toBe(RELEASE_APK);
    expect(stepArgs(target)).toEqual([STORE_GRADLE_PROPERTY, ':app:assembleRelease']);

    const androidGradle = read(join(ANDROID_PROJECT_DIR, 'app', 'build.gradle'));
    expect(androidGradle).toContain('minifyEnabled true');
    expect(androidGradle).toContain('shrinkResources true');
    expect(androidGradle).toContain('getDefaultProguardFile("proguard-android-optimize.txt")');

    expect(androidWorkflow).toContain('keytool -genkeypair -noprompt');
    expect(androidWorkflow).toContain('storeFile=$RUNNER_TEMP/splotch-release-smoke.p12');
    expect(androidWorkflow).toContain(`} > ${ANDROID_PROJECT_DIR}/keystore.properties`);
    expect(androidWorkflow.match(/run: npm run android:apk:store$/gm)).toHaveLength(1);
    expect(androidWorkflow).toContain(
      'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1'
    );
    expect(androidWorkflow).toContain(
      'uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1'
    );
    expect(androidWorkflow.match(/name: android-release-apk/g)).toHaveLength(2);
    expect(androidWorkflow).toContain(`path: ${RELEASE_APK}\n`);
    expect(androidWorkflow).toContain(`path: ${dirname(RELEASE_APK)}\n`);
    expect(androidWorkflow).toContain(`adb install -r ${RELEASE_APK}`);
    expect(androidWorkflow.indexOf('  smoke:')).toBeGreaterThan(
      androidWorkflow.indexOf('- name: Upload test-signed release APK')
    );
    expect(androidWorkflow).toContain('npm run test:android:device');
    expect(packageJson.scripts['test:android:device']).toBe('maestro test .maestro/smoke.yaml');
  });

  it('builds the store-identity iOS Release simulator app without a signing identity, then installs it', () => {
    expect(packageJson.scripts['ios:simulator']).toBe(
      'node tools/release/build-native-release.mjs simulator'
    );
    const target = TARGETS.simulator;
    expect(target.appId).toBe(STORE_APP_ID);
    expect(target.artifact).toBe(RELEASE_SIMULATOR_APP);
    const args = stepArgs(target);
    expect(args).toEqual(
      expect.arrayContaining([
        '-configuration',
        'Release',
        'generic/platform=iOS Simulator',
        '-xcconfig',
        STORE_XCCONFIG,
        'CODE_SIGNING_ALLOWED=NO',
      ])
    );
    expect(args.join(' ')).not.toContain('DEVELOPMENT_TEAM');
    expect(args).not.toContain('-allowProvisioningUpdates');

    expect(iosWorkflow).toContain('run: npm run ios:simulator');
    expect(iosWorkflow).toContain(`run: npm run test:ios -- ${SKIP_BUILD_FLAG}`);
    expect(iosWorkflow.indexOf('run: npm run ios:simulator')).toBeLessThan(
      iosWorkflow.indexOf('run: npm run test:ios')
    );
    expect(iosSmokeRunner).toContain('if (!skipBuild) await sh(BUILD_SIMULATOR_APP);');
    expect(iosSmokeRunner).toContain(
      "const BUILD_SIMULATOR_APP = 'node tools/release/build-native-release.mjs simulator';"
    );
    expect(iosSmokeRunner).toContain(
      "await simctl('install', device.udid, join(ROOT, RELEASE_SIMULATOR_APP));"
    );
  });

  it('builds both Release apps on the pull requests that touch them', () => {
    expect(nativeCompileWorkflow).toContain('run: npm run android:apk\n');
    expect(nativeCompileWorkflow).toContain('run: npm run ios:simulator\n');
  });

  it('budgets hosted XCTest startup independently of the app paint assertion', () => {
    const smokeStep = stepBlock(iosSmokeJob, 'Run iOS simulator smoke test');
    expect(smokeStep).toContain('MAESTRO_DRIVER_STARTUP_TIMEOUT: 300000');
    expect(smokeStep).toContain('timeout-minutes: 40');
    expect(read('.maestro/smoke.yaml')).toContain('timeout: 30000');
  });

  // A job cut off by its timeout runs none of its own failure() steps, so a
  // gate that files from inside the job it reports on files nothing on a hang.
  // A reporter that checks out and installs would also hand issues: write to
  // every dependency's install scripts.
  it.each([
    ['android-deploy.yml', androidWorkflow],
    ['ios-deploy.yml', iosWorkflow],
  ])('%s files its failure from a downstream job that builds nothing', (_name, workflow) => {
    const jobs = jobBlocks(workflow);
    const filers = jobs.filter(({ text }) => /^ {6}issues: write$/m.test(text));
    expect(filers.map(({ id }) => id)).toEqual(['report-failure']);

    const [reporter] = filers;
    expect(reporter.text).toMatch(/^ {4}needs: /m);
    expect(reporter.text).toContain("!cancelled() && github.event_name == 'push'");
    expect(reporter.text).toContain(".result != 'success'");
    expect(reporter.text).not.toContain('failure()');
    expect(reporter.text).not.toContain('actions/checkout');
    expect(reporter.text).not.toContain('setup-pnpm');
    expect(reporter.text).toContain('- name: File the failure');
  });

  it('filters native compile pull requests and main pushes on the same paths', () => {
    const pathLists = nativeCompilePathLists();
    expect(pathLists).toHaveLength(2);
    expect(pathLists[1]).toBe(pathLists[0]);
    expect(pathLists[0]).toContain("- '.github/workflows/native-compile.yml'");
  });

  it.each([
    ['a file at the root of the list', ['package.json'], 'package.json', true],
    ['a nested file under **', ['a/**'], 'a/b/c.ts', true],
    ['a file * does not cross into', ['a/*'], 'a/b/c.ts', false],
    ['a file a later ! excludes', ['a/**', '!a/**/*.md'], 'a/b/README.md', false],
    ['a top-level file a later ! excludes', ['a/**', '!a/**/*.md'], 'a/README.md', false],
    ['a file the ! leaves alone', ['a/**', '!a/**/*.md'], 'a/b/c.ts', true],
  ])('reads %s as GitHub does', (_case, globs, path, matches) => {
    expect(pathFilter(globs)(path)).toBe(matches);
  });

  it('filters native compile on every input its commands read', () => {
    const appFiles = trackedFiles(...APP_BUILD_PATHS);
    expect(appFiles.some((file) => file.startsWith(`${ANDROID_PROJECT_DIR}/`))).toBe(true);
    const buildInputs = appFiles.filter((file) => !file.endsWith('.md'));

    const roots = nativeCompileToolEntryPoints();
    const reachedTools = localImportClosure(roots);
    expect(roots.length).toBeGreaterThan(0);
    expect(reachedTools.length, 'the walk follows imports past the entry points').toBeGreaterThan(
      roots.length
    );

    const localActions = new Set(
      [...nativeCompileWorkflow.matchAll(/^ +- uses: \.\/(\S+)$/gm)].map(
        ([, action]) => `${action}/action.yml`
      )
    );
    expect(localActions.size).toBeGreaterThan(0);

    const patches = trackedFiles(PNPM_PATCHES);
    expect(patches.length).toBeGreaterThan(0);

    const inputs = [
      ...buildInputs,
      '.github/workflows/native-compile.yml',
      ...PNPM_INSTALL_INPUTS,
      ...patches,
      ...localActions,
      ...reachedTools,
    ];
    for (const input of inputs) expect(existsSync(join(repoRoot, input)), input).toBe(true);

    const filter = nativeCompileFilter();
    const unfiltered = inputs.filter((input) => !filter(input));
    expect(unfiltered, 'build inputs no native-compile.yml path matches').toEqual([]);
  });

  it('includes shared app modules and artwork while leaving documentation out', () => {
    const filter = nativeCompileFilter();
    expect(filter('DEVELOPMENT.md')).toBe(false);
    for (const input of ['src/lib/', 'assets/static/']) {
      const [tracked] = trackedFiles(input);
      expect(tracked, input).toBeTruthy();
      expect(filter(tracked), tracked).toBe(true);
    }
  });

  // The bundle reaches outside the app by relative import, and an edit to such a
  // module changes what both Release builds embed. Each one is either filtered by
  // path or under a tree left out on purpose.
  it('filters every module the app and its compiler configuration import', () => {
    const filter = nativeCompileFilter();
    const external = appExternalImports(trackedFiles(...APP_BUILD_PATHS));
    expect(external.length, 'the walk finds the app imports outside its own tree').toBeGreaterThan(
      0
    );
    for (const { file, target } of external) {
      expect(existsSync(join(repoRoot, target)), `${file} imports ${target}`).toBe(true);
    }
    const unfiltered = external.filter(({ target }) => !filter(target));
    expect(unfiltered, 'app imports no native-compile.yml path matches').toEqual([]);
  });

  it.each([
    [
      'a .native file over the plain one',
      ['src/x/contents.native.ts', 'src/x/contents.ts'],
      ['src/x/contents.native.ts'],
    ],
    [
      'each platform its own file',
      ['src/x/contents.ios.ts', 'src/x/contents.android.ts', 'src/x/contents.ts'],
      ['src/x/contents.ios.ts', 'src/x/contents.android.ts'],
    ],
    [
      'a platform file only one platform has',
      ['src/x/contents.ios.ts', 'src/x/contents.ts'],
      ['src/x/contents.ios.ts', 'src/x/contents.ts'],
    ],
    // metro-resolver's resolveSourceFile walks the extensions outermost.
    [
      'a plain .ts over a platform .tsx',
      ['src/x/contents.android.tsx', 'src/x/contents.ts'],
      ['src/x/contents.ts'],
    ],
    ['a directory index', ['src/x/contents/index.ts'], ['src/x/contents/index.ts']],
    ['no file at all as the unresolved path', [], ['src/x/contents']],
  ])('resolves as Metro does for both native builds: %s', (_case, files, expected) => {
    const present = new Set(files);
    expect(
      resolveNativeTargets('app/src/Page.tsx', '../../src/x/contents', (path) => present.has(path))
    ).toEqual(expected);
  });

  it('resolves an extensionless import to the module it names', () => {
    expect(
      resolveNativeTargets('src/rsdDrawing/RsdPrivacyContent.tsx', '../lib/privacy/contents')
    ).toContain('src/lib/privacy/contents.ts');
  });

  it('retains XCTest startup diagnostics and the flow screenshot alongside Maestro flow evidence', () => {
    const reportStep = stepBlock(iosSmokeJob, 'Upload Maestro report');
    expect(reportStep).toContain('~/.maestro/tests/');
    expect(reportStep).toContain('~/Library/Logs/maestro/xctest_runner_logs/');
    expect(reportStep).toContain('.maestro/screenshots/');
    const reportAction = read('.github/actions/upload-maestro-report/action.yml');
    expect(reportAction).toContain('path: ${{ inputs.path }}');
    expect(reportAction).toMatch(
      /default: \|\n {6}~\/\.maestro\/tests\/\n {6}\.maestro\/screenshots\/\n/
    );
    expect(reportAction).toContain('include-hidden-files: true');
    expect(read('.maestro/smoke.yaml')).toContain('- takeScreenshot: .maestro/screenshots/');
  });
});
