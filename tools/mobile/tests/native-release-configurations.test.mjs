import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const androidWorkflow = read('.github/workflows/android-deploy.yml');
const iosWorkflow = read('.github/workflows/ios-deploy.yml');
const iosSmokeRunner = read('tools/mobile/ios/run-simulator-smoke-test.mjs');

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
    expect(iosWorkflow).toContain('args=(--skip-sync)');
    expect(iosWorkflow).toContain('npm run test:ios -- "${args[@]}"');
    expect(iosSmokeRunner).toContain("'skip-sync': { type: 'boolean' }");
    expect(iosSmokeRunner).toContain("if (!skipSync) await sh('npm run cap:sync');");
  });
});
