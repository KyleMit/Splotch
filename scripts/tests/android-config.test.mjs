import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { themes } from '../../web/src/lib/design/tokens.ts';
import { ANDROID_API_LEVEL, AVD_NAME } from '../lib/android.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// Files allowed to carry the emulator API level / AVD name as literals — each
// goes red the moment a literal disagrees with ANDROID_API_LEVEL. Deliberately
// an allowlist, not a repo-wide grep: historical documents (docs/AUDIT*.md,
// docs/audit-deferred/, /scrapbook) legitimately mention old values, and only
// .ruler/ sources are enforced — ruler:check already gates the generated
// .claude/.agents mirrors.
const ENFORCED = [
  'package.json',
  '.github/workflows/android-deploy.yml',
  '.ruler/skills/mobile/android.md',
  '.ruler/skills/testing/SKILL.md',
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
