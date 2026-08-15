import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MIN_ANDROID_API_LEVEL,
  MIN_ANDROID_RELEASE,
} from '../../../../web/src/lib/components/beta/androidBeta.ts';
import { themes } from '../../../../web/src/lib/design/tokens.ts';
import { ANDROID_API_LEVEL, AVD_NAME } from '../lib/android-toolchain.mjs';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');

// Files allowed to carry the emulator API level / AVD name as literals — each
// goes red the moment a literal disagrees with ANDROID_API_LEVEL. Deliberately
// an allowlist, not a repo-wide grep: historical documents (docs/AUDIT*.md,
// docs/audit-deferred/, /scrapbook) legitimately mention old values, and only
// .ruler/ sources are enforced — ruler:check already gates the generated
// .claude/.agents mirrors.
const ENFORCED = [
  'package.json',
  '.github/workflows/android-deploy.yml',
  'docs/MOBILE/android.md',
  'docs/TESTING.md',
  'docs/COMPATIBILITY.md',
];

// Context-anchored so unrelated API levels in the same files (the API 24
// minSdk floor, "API 31+" feature notes) don't false-positive.
const EMULATOR_API_PATTERNS = [
  /Pixel_7_Pro_API_(\d+)/g,
  /\bAPI (\d+) system image\b/g,
  /api-level:\s*(\d+)/g,
  /shipped app on Android API (\d+)/g,
];

describe('Android emulator API level single source', () => {
  it('derives the AVD name from ANDROID_API_LEVEL', () => {
    expect(AVD_NAME).toBe(`Pixel_7_Pro_API_${ANDROID_API_LEVEL}`);
  });

  it('workflow api-level input matches', () => {
    const yml = read('.github/workflows/android-deploy.yml');
    expect(yml.match(/api-level:\s*(\d+)/)[1]).toBe(String(ANDROID_API_LEVEL));
  });

  for (const file of ENFORCED) {
    it(`${file} carries no stale AVD/API-level literals`, () => {
      const text = read(file);
      const levels = EMULATOR_API_PATTERNS.flatMap((pattern) =>
        [...text.matchAll(pattern)].map(([, level]) => Number(level))
      );
      expect(levels.length).toBeGreaterThan(0);
      for (const level of levels) expect(level).toBe(ANDROID_API_LEVEL);
    });
  }
});

const GRADLE_MIN_SDK = Number(
  read('android/variables.gradle').match(/^\s*minSdkVersion = (\d+)$/m)[1]
);

// The human release name each installable floor shipped as. Extend when
// minSdkVersion moves — an unmapped level fails the floor tests below rather
// than letting a stale release label ride along with a fresh API number.
const ANDROID_RELEASE_BY_MIN_SDK = { 24: '7.0' };
const GRADLE_MIN_RELEASE = ANDROID_RELEASE_BY_MIN_SDK[GRADLE_MIN_SDK];

// What each named group in a support-floor claim must read, so a claim is
// checked by the groups its own pattern captured rather than by a branch per
// group name — a pattern that names a group this map doesn't cover fails
// instead of being skipped.
const SUPPORT_FLOOR_BY_GROUP = {
  api: String(GRADLE_MIN_SDK),
  release: GRADLE_MIN_RELEASE,
  releaseMajor: GRADLE_MIN_RELEASE?.split('.')[0],
};

// Context-anchored claims of the published Android support floor. Named groups
// carry what each claim states: `api` (the API level), `release` (the full
// release, "7.0"), `releaseMajor` (the release's major only, "7"). Prose
// patterns use \s+ between words because dprint re-wraps at 100 columns.
const SUPPORT_FLOOR_CLAIMS = [
  [
    'supported-devices table row',
    'docs/COMPATIBILITY.md',
    /\|\s+\*\*Native Android app\*\*\s+\|\s+\*\*Android (?<release>\d+\.\d+) \/ API (?<api>\d+)\+\*\*/,
  ],
  [
    'why-these-numbers bullet',
    'docs/COMPATIBILITY.md',
    /\*\*Native\s+Android\s+API\s+(?<api>\d+)\s+\((?<release>\d+\.\d+)\)\*\*\s+is\s+older\s+than\s+the\s+web\s+floor/,
  ],
  [
    'enforcement table value',
    'docs/COMPATIBILITY.md',
    /\|\s+Native Android min SDK\s+\|\s+`android\/variables\.gradle` → `minSdkVersion`\s+\|\s+`(?<api>\d+)`/,
  ],
  [
    'floor-validation emulator claim',
    'docs/COMPATIBILITY.md',
    /The\s+stock\s+Android\s+API\s+(?<api>\d+)\s+emulator\s+image\s+ships\s+a\s+pre-floor\s+WebView\s+\(a\s+maintained\s+Android\s+(?<releaseMajor>\d+)\s+device/,
  ],
  [
    'minimum supported OS statement',
    'docs/MOBILE/android.md',
    /Minimum supported OS: \*\*Android (?<release>\d+\.\d+) \/ API (?<api>\d+)\*\*/,
  ],
];

describe('Android support floor single source', () => {
  it('maps minSdkVersion to its Android release', () => {
    expect(GRADLE_MIN_RELEASE, `add ${GRADLE_MIN_SDK} to ANDROID_RELEASE_BY_MIN_SDK`).toBeDefined();
  });

  it('the /beta Android constants track minSdkVersion', () => {
    expect(MIN_ANDROID_API_LEVEL).toBe(GRADLE_MIN_SDK);
    expect(MIN_ANDROID_RELEASE).toBe(GRADLE_MIN_RELEASE);
  });

  for (const [claim, file, pattern] of SUPPORT_FLOOR_CLAIMS) {
    it(`${file} ${claim} matches minSdkVersion`, () => {
      const groups = read(file).match(pattern)?.groups;
      expect(groups, `expected ${file} to contain a match for ${pattern}`).toBeDefined();
      const stated = Object.entries(groups);
      expect(stated.length, `${pattern} names no group to check`).toBeGreaterThan(0);
      for (const [group, value] of stated) {
        expect(value, `${file} ${claim} states ${group}`).toBe(SUPPORT_FLOOR_BY_GROUP[group]);
      }
    });
  }
});

describe('Android manifest kids-compliance', () => {
  it('keeps allowBackup disabled so drawings never leave the device via cloud backup', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).not.toContain('android:dataExtractionRules');
    expect(manifest).not.toContain('android:fullBackupContent');
  });
});

describe('Android native theme backgrounds', () => {
  const colorValue = (path) => {
    const match = read(path).match(/<color name="app_background">(#[0-9a-f]+)<\/color>/i);
    expect(match).not.toBeNull();
    return match[1].toLowerCase();
  };

  it('sets the AppCompat background used before the web view paints', () => {
    const styles = read('android/app/src/main/res/values/styles.xml');
    expect(styles).toMatch(
      /<style name="AppTheme"[^>]*>[\s\S]*?<item name="android:colorBackground">@color\/app_background<\/item>[\s\S]*?<\/style>/
    );
  });

  it('keeps Capacitor BridgeActivity on the DayNight app theme', () => {
    const styles = read('android/app/src/main/res/values/styles.xml');
    expect(styles).toMatch(/<style name="AppTheme\.NoActionBar" parent="AppTheme"\s*\/>/);
  });

  it('varies WebView theme detection through one day/night boolean resource', () => {
    const styles = read('android/app/src/main/res/values/styles.xml');
    expect(styles).toMatch(
      /<style name="AppTheme"[^>]*>[\s\S]*?<item name="android:isLightTheme">@bool\/app_theme_is_light<\/item>[\s\S]*?<\/style>/
    );
    expect(read('android/app/src/main/res/values/bools.xml')).toContain(
      '<bool name="app_theme_is_light">true</bool>'
    );
    expect(read('android/app/src/main/res/values-night/bools.xml')).toContain(
      '<bool name="app_theme_is_light">false</bool>'
    );
  });

  it('matches the web app background in both themes', () => {
    expect(colorValue('android/app/src/main/res/values/colors.xml')).toBe(
      themes.light.appBg.toLowerCase()
    );
    expect(colorValue('android/app/src/main/res/values-night/colors.xml')).toBe(
      themes.dark.appBg.toLowerCase()
    );
  });
});
