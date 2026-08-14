import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail } from '../lib/proc.mjs';

const configPath = 'capacitor.config.json';
const config = JSON.parse(readFileSync(join(ROOT, configPath), 'utf8'));
const expectedAppId = config.appId;
const expectedAppName = config.appName;

for (const [field, value] of [
  ['appId', expectedAppId],
  ['appName', expectedAppName],
]) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`[check-app-ids] ${configPath}: ${field} must be a non-empty string`);
  }
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

// These five documents name the native app id or app name. Each is authored once
// under docs/ (ADR-0107); the list used to fan out over the three skill trees
// back when the same prose was copied into each of them.
const docChecks = [
  {
    path: 'docs/PROFILING.md',
    values: [
      ['documented Android launch target', /`am start -n ([A-Za-z0-9._-]+)\/\.MainActivity`/],
    ],
  },
  {
    path: 'docs/TESTING.md',
    values: [['documented Maestro appId', /^appId:\s*([^\s#]+)\s*$/m]],
  },
  {
    path: 'docs/MOBILE/android.md',
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
    path: 'docs/MOBILE/ios.md',
    values: [
      ['release-checklist bundle ID', /^\* \[x\] Bundle ID `([^`]+)`, display name/m],
      ['App Store Connect bundle ID', /bundle ID `([^`]+)`, SKU `splotch`/],
    ],
  },
  {
    path: 'docs/MOBILE/native.md',
    values: [
      ['documented fastlane bundle ID', /iOS bundle ID `([^`]+)`, the Android package name/],
    ],
  },
];

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
    path: 'tools/perf/android/capture-webview-session.mjs',
    values: [['APP_ID', /^const APP_ID = ['"]([^'"]+)['"];\s*$/m]],
  },
  {
    // The /beta page builds both Play Store URLs from this — a stale id
    // sends beta testers to a listing that doesn't exist.
    path: 'web/src/lib/components/beta/androidBeta.ts',
    values: [['PLAY_STORE_APP_ID', /^export const PLAY_STORE_APP_ID = ['"]([^'"]+)['"];\s*$/m]],
  },
  {
    path: '.maestro/smoke.yaml',
    values: [['appId', /^appId:\s*([^\s#]+)\s*$/m]],
  },
  ...docChecks,
];

// The installed-app display name is declared independently in the same three-way
// shape the app id is, so it gets the same guard: capacitor.config.json is the
// source, and a rename that misses a copy fails here instead of shipping a
// mismatched launcher label.
const appNameChecks = [
  {
    path: 'android/app/src/main/res/values/strings.xml',
    values: [['app_name', /^\s*<string\s+name="app_name">([^<]+)<\/string>\s*$/m]],
  },
  {
    path: 'ios/App/App/Info.plist',
    values: [
      [
        'CFBundleDisplayName',
        /<key>CFBundleDisplayName<\/key>\s*\r?\n\s*<string>([^<]+)<\/string>/,
      ],
    ],
  },
].map((check) => ({ ...check, expected: expectedAppName }));

const errors = [];

for (const check of [...checks, ...appNameChecks]) {
  const source = readFileSync(join(ROOT, check.path), 'utf8');
  const expected = check.expected ?? expectedAppId;
  for (const [name, extractor] of check.values) {
    const actual =
      typeof extractor === 'function' ? extractor(source) : source.match(extractor)?.[1]?.trim();
    if (actual !== expected) {
      errors.push(
        `${check.path} (${name}): expected "${expected}", found ${
          actual === undefined ? 'no matching value' : `"${actual}"`
        }`
      );
    }
  }
}

if (errors.length > 0) {
  fail(
    `[check-app-ids] Native app identity mismatch:\n${errors.map((error) => `  - ${error}`).join('\n')}`
  );
}

console.log(
  `[check-app-ids] all native app IDs match "${expectedAppId}" and names match "${expectedAppName}".`
);
