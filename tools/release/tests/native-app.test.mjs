import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORE_GRADLE_PROPERTY, STORE_XCCONFIG, TARGETS } from '../build-native-release.mjs';
import {
  ANDROID_PROJECT_DIR,
  DEV_APP_ID,
  IOS_PROJECT_DIR,
  STORE_APP_ID,
} from '../lib/native-app.mjs';
import { ANDROID_GRADLE_PATH, IOS_PBXPROJ_PATH } from '../lib/native-version.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');
const gradle = read(ANDROID_GRADLE_PATH);
const pbxproj = read(IOS_PBXPROJ_PATH);

/** The app target's build settings for one configuration, found by its Info.plist. */
function targetSettings(configuration) {
  const blocks = pbxproj.matchAll(
    /^\s*[A-F0-9]+ \/\* (Debug|Release) \*\/ = \{([\s\S]*?)^\s*name = \1;\s*\n\s*\};$/gm
  );
  for (const [, name, body] of blocks) {
    if (name === configuration && /^\s*INFOPLIST_FILE = Splotch\/Info\.plist;$/m.test(body)) {
      return body;
    }
  }
  throw new Error(`no ${configuration} configuration for the app target`);
}

const setting = (body, key) => new RegExp(`^\\s*${key} = ([^;\\n]*);$`, 'm').exec(body)?.[1];

describe('the React Native app identity', () => {
  // The store build upgrades the installed shipping app only under its own application ID.
  it('is the shipping app identity', () => {
    expect(STORE_APP_ID).toBe('art.splotch.app');
    expect(DEV_APP_ID).toBe(`${STORE_APP_ID}.dev`);
  });

  it('is what the Android project declares, with .dev on every build but the store one', () => {
    expect(gradle).toMatch(new RegExp(`^\\s*namespace "${STORE_APP_ID}"$`, 'm'));
    expect(gradle).toMatch(new RegExp(`^\\s*applicationId "${STORE_APP_ID}"$`, 'm'));
    // Only this invocation's -P may opt in; gradle.properties and the environment cannot.
    expect(gradle).toContain(
      "def storeProperty = gradle.startParameter.projectProperties['splotch.store']"
    );
    expect(gradle).toMatch(
      /storeProperty == null && findProperty\('splotch\.store'\) != null\) \{\n\s+throw/
    );
    expect(STORE_GRADLE_PROPERTY).toBe('-Psplotch.store=true');
    expect(gradle).toMatch(/debug \{\n\s+applicationIdSuffix "\.dev"\n\s+\}/);
    expect(gradle).toMatch(/if \(!storeBuild\) \{\n\s+applicationIdSuffix "\.dev"\n\s+\}/);
    expect(gradle).toContain(
      'signingConfig storeBuild ? signingConfigs.upload : signingConfigs.debug'
    );
  });

  // AGP resolves the manifest's `.MainActivity` and the generated R and BuildConfig classes
  // against the namespace, so every Kotlin source lives in that package.
  it('names the Android namespace as the Kotlin package', () => {
    const sources = join(
      ANDROID_PROJECT_DIR,
      'app',
      'src',
      'main',
      'java',
      ...STORE_APP_ID.split('.')
    );
    const files = readdirSync(join(repoRoot, sources));
    expect(files).toContain('MainActivity.kt');
    for (const file of files) {
      expect(read(join(sources, file)).split('\n')[0], file).toBe(`package ${STORE_APP_ID}`);
    }
  });

  it('is what the iOS project declares, with .dev on every build but the store one', () => {
    const debug = targetSettings('Debug');
    const release = targetSettings('Release');
    expect(setting(debug, 'PRODUCT_BUNDLE_IDENTIFIER')).toBe(DEV_APP_ID);
    expect(setting(release, 'PRODUCT_BUNDLE_IDENTIFIER')).toBe(
      `"${STORE_APP_ID}$(SPLOTCH_APP_ID_SUFFIX)"`
    );
    expect(setting(release, 'SPLOTCH_APP_ID_SUFFIX')).toBe('.dev');
    expect(read(join(IOS_PROJECT_DIR, STORE_XCCONFIG))).toMatch(/^SPLOTCH_APP_ID_SUFFIX =$/m);
  });

  // A team picked in Xcode's UI lands in project.pbxproj; it belongs in local.xcconfig.
  it('takes the Apple team from the untracked xcconfig beside the project', () => {
    expect(pbxproj).not.toContain('DEVELOPMENT_TEAM');
    expect(read(join(IOS_PROJECT_DIR, 'Splotch.xcconfig'))).toContain('#include? "local.xcconfig"');
    expect(read(join(IOS_PROJECT_DIR, STORE_XCCONFIG))).toContain('#include? "local.xcconfig"');
    expect(read(join(IOS_PROJECT_DIR, 'local.xcconfig.example'))).toMatch(/^DEVELOPMENT_TEAM = /m);
  });
});

describe('the release build targets', () => {
  const optsIn = ({ steps }) =>
    steps.some(({ args }) => args.includes(STORE_GRADLE_PROPERTY) || args.includes(STORE_XCCONFIG));

  // The store artifacts, plus the two Release builds the deploy smokes install, which carry the
  // store identity because that is what ships and which no device accepts over the store copy.
  it('opt into the store identity exactly for the store artifacts and the smoke builds', () => {
    const store = Object.entries(TARGETS)
      .filter(([, target]) => optsIn(target))
      .map(([name]) => name);
    expect(store).toEqual(['bundle', 'store-apk', 'archive', 'ipa', 'simulator']);
    for (const [name, target] of Object.entries(TARGETS)) {
      expect(target.appId, name).toBe(optsIn(target) ? STORE_APP_ID : DEV_APP_ID);
    }
  });

  it('are the only package scripts that reach the store identity', () => {
    const { scripts } = JSON.parse(read('package.json'));
    const optIns = Object.entries(scripts).filter(([, body]) =>
      /splotch\.store|Store\.xcconfig|build-native-release\.mjs (bundle|store-apk|archive|ipa|simulator)$/.test(
        body
      )
    );
    expect(Object.fromEntries(optIns)).toEqual({
      'android:bundle': 'node tools/release/build-native-release.mjs bundle',
      'android:apk:store': 'node tools/release/build-native-release.mjs store-apk',
      'ios:archive': 'node tools/release/build-native-release.mjs archive',
      'ios:ipa': 'node tools/release/build-native-release.mjs ipa',
      'ios:simulator': 'node tools/release/build-native-release.mjs simulator',
    });
  });
});

// The documents and the Maestro flow that name an app ID: the store ID unless the entry names the
// .dev one. Each is authored once under docs/ (ADR-0107), so a rename that misses one fails here
// instead of leaving the guides wrong.
const STORE_APP_ID_MENTIONS = [
  [
    'the /beta page Play Store links',
    'src/lib/components/beta/androidBeta.ts',
    /^export const PLAY_STORE_APP_ID = ['"]([^'"]+)['"];\s*$/m,
  ],
  ['the Maestro smoke flow', '.maestro/smoke.yaml', /^appId:\s*([^\s#]+)\s*$/m],
  ['the documented Maestro appId', 'docs/TESTING.md', /^appId:\s*([^\s#]+)\s*$/m],
  [
    'the documented Android development build identity',
    'docs/MOBILE/android.md',
    /\*\*Native Release build\*\*: `npm run android:apk` builds the React Native app as\s*`([^`]+)`/,
    DEV_APP_ID,
  ],
  [
    'the documented physical-device development identity',
    'docs/MOBILE/native.md',
    /Physical-device\s+development builds use\s+`([^`]+)`/,
    DEV_APP_ID,
  ],
  [
    'the Android release-checklist app ID',
    'docs/MOBILE/android.md',
    /^\* \[x\] App ID `([^`]+)`, name/m,
  ],
  [
    'the iOS release-checklist bundle ID',
    'docs/MOBILE/ios.md',
    /^\* \[x\] Bundle ID `([^`]+)`, display name/m,
  ],
  ['the App Store Connect bundle ID', 'docs/MOBILE/ios.md', /bundle ID `([^`]+)`, SKU `splotch`/],
];

describe('every other place that names an app ID', () => {
  it.each(STORE_APP_ID_MENTIONS)('%s', (_name, path, pattern, expected = STORE_APP_ID) => {
    expect(read(path).match(pattern)?.[1]?.trim(), path).toBe(expected);
  });
});
