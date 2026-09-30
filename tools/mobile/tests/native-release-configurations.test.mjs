import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { jobBlocks } from '../../ci-mirror/tests/workflow-job-steps.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const androidWorkflow = read('.github/workflows/android-deploy.yml');
const iosWorkflow = read('.github/workflows/ios-deploy.yml');
const iosSmokeRunner = read('tools/mobile/ios/run-simulator-smoke-test.mjs');
const nativeCompileWorkflow = read('.github/workflows/native-compile.yml');

// Gradle compiles android/, xcodebuild compiles ios/, and cap update and cap
// sync configure both from capacitor.config.json.
const NATIVE_TREES = ['android', 'ios'];
const CAPACITOR_CONFIG = 'capacitor.config.json';

// What `pnpm install` reads. pnpm-workspace.yaml's nodeLinker decides the
// node_modules paths cap sync writes into the native projects, and editing it
// need not touch the lockfile.
const PNPM_INSTALL_INPUTS = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];

// Tests builds this on every pull request, so a tools/ change that breaks the
// native web bundle fails there; the native compile filter leaves web inputs out.
const WEB_BUNDLE_SCRIPT = 'build:cap';

const nativeCompilePathLists = () =>
  nativeCompileWorkflow
    .split(/^ {4}paths:\n/m)
    .slice(1)
    .map((block) => block.match(/^(?: {6}- .+\n)+/)[0]);

/** GitHub's path-filter globs: `**` crosses directories, `*` does not. */
const nativeCompilePathFilters = () =>
  [...nativeCompilePathLists()[0].matchAll(/^ {6}- '([^']+)'$/gm)].map(
    ([, glob]) =>
      new RegExp(
        `^${glob
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*|\*/g, (stars) => (stars === '**' ? '.*' : '[^/]*'))}$`
      )
  );

/** tools/ scripts named by the npm scripts the workflow runs, with every `npm run` expanded. */
function nativeCompileToolEntryPoints() {
  const expand = (name, seen) => {
    if (seen.has(name) || name === WEB_BUNDLE_SCRIPT) return [];
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

describe('native release configuration gates', () => {
  it('builds and boots a test-signed optimized Android release APK', () => {
    expect(packageJson.scripts['android:apk:release']).toBe(
      'npm run cap:sync && node tools/mobile/android/run-gradle.mjs :app:assembleRelease'
    );

    const androidGradle = read('android/app/build.gradle');
    expect(androidGradle).toContain('minifyEnabled true');
    expect(androidGradle).toContain('shrinkResources true');
    expect(androidGradle).toContain("getDefaultProguardFile('proguard-android-optimize.txt')");

    expect(androidWorkflow).toContain('keytool -genkeypair -noprompt');
    expect(androidWorkflow).toContain('storeFile=$RUNNER_TEMP/splotch-release-smoke.p12');
    expect(androidWorkflow.match(/run: npm run android:apk:release/g)).toHaveLength(1);
    expect(androidWorkflow).toContain(
      'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1'
    );
    expect(androidWorkflow).toContain(
      'uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1'
    );
    expect(androidWorkflow.match(/name: android-release-apk/g)).toHaveLength(2);
    expect(
      androidWorkflow.match(
        /path: android\/app\/build\/outputs\/apk\/release(?:\/app-release\.apk)?/g
      )
    ).toHaveLength(2);
    expect(androidWorkflow).toContain(
      'adb install -r android/app/build/outputs/apk/release/app-release.apk'
    );
    expect(androidWorkflow.indexOf('  smoke:')).toBeGreaterThan(
      androidWorkflow.indexOf('- name: Upload test-signed release APK')
    );
    expect(androidWorkflow).not.toContain('android/app/build/outputs/apk/debug/app-debug.apk');
  });

  it('compiles the iOS Release simulator configuration without a store signing identity', () => {
    const releaseScript = packageJson.scripts['ios:build:release'];
    expect(releaseScript).toContain('-configuration Release');
    expect(releaseScript).toContain('-destination "generic/platform=iOS Simulator"');
    expect(releaseScript).toContain('CODE_SIGNING_ALLOWED=NO');
    expect(releaseScript).not.toContain('local.xcconfig');
    expect(releaseScript).not.toContain('DEVELOPMENT_TEAM');
    expect(iosWorkflow).toContain('run: npm run ios:build:release');
    expect(iosWorkflow).toContain('run: npm run test:ios -- --skip-sync');
    expect(iosSmokeRunner).toContain("const SKIP_SYNC_FLAG = '--skip-sync';");
    expect(iosSmokeRunner).toContain("if (!skipSync) await sh('npm run cap:sync');");
  });

  it('budgets hosted XCTest startup independently of the app paint assertion', () => {
    const smokeStep = iosWorkflow
      .split('- name: Run iOS simulator smoke test')[1]
      .split('- name:')[0];
    expect(smokeStep).toContain('MAESTRO_DRIVER_STARTUP_TIMEOUT: 300000');
    expect(smokeStep).toContain('timeout-minutes: 20');
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

  it('filters native compile on every input its commands read', () => {
    const nativeTreeFiles = execFileSync('git', ['ls-files', '--', ...NATIVE_TREES], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    expect(
      NATIVE_TREES.every((tree) => nativeTreeFiles.some((file) => file.startsWith(`${tree}/`)))
    ).toBe(true);

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

    const inputs = [
      ...nativeTreeFiles,
      CAPACITOR_CONFIG,
      '.github/workflows/native-compile.yml',
      ...PNPM_INSTALL_INPUTS,
      ...localActions,
      ...reachedTools,
    ];
    for (const input of inputs) expect(existsSync(join(repoRoot, input)), input).toBe(true);

    const filters = nativeCompilePathFilters();
    const unfiltered = inputs.filter((input) => !filters.some((filter) => filter.test(input)));
    expect(unfiltered, 'compile inputs no native-compile.yml path matches').toEqual([]);
  });

  it('leaves the native web bundle to the Tests workflow, which builds it on every pull request', () => {
    const testsWorkflow = read('.github/workflows/test.yml');
    expect(testsWorkflow).toMatch(/^ {2}pull_request:$/m);
    expect(testsWorkflow).not.toMatch(/^ {2}pull_request:\n {4}paths(?:-ignore)?:/m);
    expect(testsWorkflow).toMatch(new RegExp(`^ +run: .*npm run ${WEB_BUNDLE_SCRIPT}$`, 'm'));
  });

  it('retains XCTest startup diagnostics alongside Maestro flow evidence', () => {
    const reportStep = iosWorkflow.split('- name: Upload Maestro report')[1].split('- name:')[0];
    expect(reportStep).toContain('~/.maestro/tests/');
    expect(reportStep).toContain('~/Library/Logs/maestro/xctest_runner_logs/');
    const reportAction = read('.github/actions/upload-maestro-report/action.yml');
    expect(reportAction).toContain('path: ${{ inputs.path }}');
    expect(reportAction).toContain('default: ~/.maestro/tests/');
    expect(reportAction).toContain('include-hidden-files: true');
  });
});
