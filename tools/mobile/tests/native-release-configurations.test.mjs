import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const androidWorkflow = read('.github/workflows/android-deploy.yml');
const iosWorkflow = read('.github/workflows/ios-deploy.yml');

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
    expect(androidWorkflow).toContain('run: npm run android:apk:release');
    expect(androidWorkflow).toContain(
      'adb install -r android/app/build/outputs/apk/release/app-release.apk'
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
    expect(iosWorkflow).toContain('run: npm run test:ios');
  });
});
