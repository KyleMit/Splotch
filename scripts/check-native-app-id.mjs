import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail } from './lib/proc.mjs';

const configPath = 'capacitor.config.json';
const config = JSON.parse(readFileSync(join(ROOT, configPath), 'utf8'));
const expectedAppId = config.appId;

if (typeof expectedAppId !== 'string' || expectedAppId.length === 0) {
  fail(`[check-native-app-id] ${configPath}: appId must be a non-empty string`);
}

function xcodeBundleIdentifier(source, configuration) {
  const configurationBlocks = source.matchAll(
    /^\s*[A-F0-9]+ \/\* (Debug|Release) \*\/ = \{([\s\S]*?)^\s*name = \1;\s*\r?\n\s*\};$/gm
  );

  for (const [, name, body] of configurationBlocks) {
    if (name === configuration && /^\s*INFOPLIST_FILE = App\/Info\.plist;\s*$/m.test(body)) {
      return body.match(/^\s*PRODUCT_BUNDLE_IDENTIFIER = ([^;\r\n]+);/m)?.[1]?.trim();
    }
  }
}

const skillChecks = ['.ruler/skills', '.claude/skills', '.agents/skills'].flatMap((root) => [
  {
    path: `${root}/profiling/SKILL.md`,
    values: [
      ['documented Android launch target', /`am start -n ([A-Za-z0-9._-]+)\/\.MainActivity`/],
    ],
  },
  {
    path: `${root}/testing/SKILL.md`,
    values: [['documented Maestro appId', /^appId:\s*([^\s#]+)\s*$/m]],
  },
  {
    path: `${root}/mobile/android.md`,
    values: [
      ['installed-package troubleshooting target', /a copy of `([^`]+)`\s*$/m],
      [
        'documented adb uninstall target',
        /^\s*adb -s <serial> uninstall ([^\s#]+)\s+# <serial> from adb:devices$/m,
      ],
      ['release-checklist app ID', /^\* \[x\] App ID `([^`]+)`, name/m],
    ],
  },
  {
    path: `${root}/mobile/ios.md`,
    values: [
      ['release-checklist bundle ID', /^\* \[x\] Bundle ID `([^`]+)`, display name/m],
      ['App Store Connect bundle ID', /bundle ID `([^`]+)`, SKU `splotch`/],
    ],
  },
  {
    path: `${root}/mobile/native.md`,
    values: [
      ['documented fastlane bundle ID', /iOS bundle ID `([^`]+)`, the Android package name/],
    ],
  },
]);

const checks = [
  {
    path: 'android/app/build.gradle',
    values: [
      ['android.namespace', /^\s*namespace\s*=\s*["']([^"']+)["']\s*$/m],
      ['defaultConfig.applicationId', /^\s*applicationId\s+["']([^"']+)["']\s*$/m],
    ],
  },
  {
    path: 'android/app/src/main/res/values/strings.xml',
    values: [
      ['package_name', /^\s*<string\s+name="package_name">([^<]+)<\/string>\s*$/m],
      ['custom_url_scheme', /^\s*<string\s+name="custom_url_scheme">([^<]+)<\/string>\s*$/m],
    ],
  },
  {
    path: 'android/app/src/main/java/art/splotch/app/MainActivity.java',
    values: [['package declaration', /^package\s+([^;]+);\s*$/m]],
  },
  {
    path: 'android/app/src/main/java/art/splotch/app/DeviceLockPlugin.java',
    values: [['package declaration', /^package\s+([^;]+);\s*$/m]],
  },
  {
    path: 'ios/App/App.xcodeproj/project.pbxproj',
    values: [
      ['Debug PRODUCT_BUNDLE_IDENTIFIER', (source) => xcodeBundleIdentifier(source, 'Debug')],
      ['Release PRODUCT_BUNDLE_IDENTIFIER', (source) => xcodeBundleIdentifier(source, 'Release')],
    ],
  },
  {
    path: 'scripts/perf/android.mjs',
    values: [['APP_ID', /^const APP_ID = ['"]([^'"]+)['"];\s*$/m]],
  },
  {
    // The /android-beta page builds both Play Store URLs from this — a stale id
    // sends beta testers to a listing that doesn't exist.
    path: 'web/src/routes/android-beta/androidBeta.ts',
    values: [['PLAY_STORE_APP_ID', /^export const PLAY_STORE_APP_ID = ['"]([^'"]+)['"];\s*$/m]],
  },
  {
    path: '.maestro/smoke.yaml',
    values: [['appId', /^appId:\s*([^\s#]+)\s*$/m]],
  },
  ...skillChecks,
];

const errors = [];

for (const check of checks) {
  const source = readFileSync(join(ROOT, check.path), 'utf8');
  for (const [name, extractor] of check.values) {
    const actualAppId =
      typeof extractor === 'function' ? extractor(source) : source.match(extractor)?.[1]?.trim();
    if (actualAppId !== expectedAppId) {
      errors.push(
        `${check.path} (${name}): expected "${expectedAppId}", found ${
          actualAppId === undefined ? 'no matching value' : `"${actualAppId}"`
        }`
      );
    }
  }
}

if (errors.length > 0) {
  fail(
    `[check-native-app-id] Native app ID mismatch:\n${errors.map((error) => `  - ${error}`).join('\n')}`
  );
}

console.log(`[check-native-app-id] all native app IDs match "${expectedAppId}".`);
