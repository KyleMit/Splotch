import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MIN_ANDROID_API_LEVEL,
  MIN_ANDROID_RELEASE,
} from '../../../../web/src/lib/components/beta/androidBeta.ts';
import { themes } from '../../../../web/src/lib/design/tokens.ts';
import { CURRENT_ANDROID_API_LEVEL, AVD_NAME } from '../lib/android-toolchain.mjs';
import {
  androidEmulatorApiLevels,
  uniqueAndroidEmulatorApiLevels,
} from '../print-emulator-api-levels.mjs';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');
const privacyInventory = JSON.parse(read('tools/mobile/privacy-permission-inventory.json'));

// Files allowed to carry the emulator API level / AVD name as literals — each
// goes red the moment a literal disagrees with CURRENT_ANDROID_API_LEVEL. Deliberately
// an allowlist, not a repo-wide grep: historical documents (docs/AUDIT*.md,
// docs/audit-deferred/, /scrapbook) legitimately mention old values, and only
// .ruler/ sources are enforced — ruler:check already gates the generated
// .claude/.agents mirrors.
const ENFORCED = [
  'package.json',
  'docs/MOBILE/native.md',
  'docs/MOBILE/android.md',
  'docs/TESTING.md',
  'docs/COMPATIBILITY.md',
  'docs/DEPENDENCIES.md',
];

// Context-anchored so unrelated API levels in the same files (the API 24
// minSdk floor, "API 31+" feature notes) don't false-positive.
const EMULATOR_API_PATTERNS = [
  /Pixel_7_Pro_API_(\d+)/g,
  /\bAPI (\d+) system image\b/g,
  /api-level:\s*(\d+)/g,
  /current(?: Android)? API (\d+)/gi,
  /\| Android current\s+\|.*?\| The `Maestro launch smoke test \(API (\d+)\)`/g,
  /\(API (\d+) \+ API \d+\)/g,
  /shipped app on Android API (\d+)/g,
];

const androidWorkflow = read('.github/workflows/android-deploy.yml');

function workflowStepScript(stepName) {
  const escapedName = stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = androidWorkflow.match(
    new RegExp(
      `      - name: ${escapedName}\\n(?:        [^\\n]*\\n)*?        run: \\|\\n((?:          .*\\n)+)`
    )
  );
  expect(match, `workflow step "${stepName}" has no multiline run script`).not.toBeNull();
  return match[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

function currentApiClaimOffsets(text) {
  return new Set(
    EMULATOR_API_PATTERNS.flatMap((pattern) =>
      [...text.matchAll(pattern)]
        .filter(([, level]) => Number(level) === CURRENT_ANDROID_API_LEVEL)
        .map((match) => match.index + match[0].lastIndexOf(match[1]))
    )
  );
}

describe('Android emulator API levels', () => {
  it('derives the local AVD name from the current API level', () => {
    expect(AVD_NAME).toBe(`Pixel_7_Pro_API_${CURRENT_ANDROID_API_LEVEL}`);
  });

  it('derives the workflow matrix from the current and declared floor owners', () => {
    expect(androidEmulatorApiLevels()).toEqual([
      CURRENT_ANDROID_API_LEVEL,
      MIN_ANDROID_API_LEVEL,
    ]);

    expect(androidWorkflow).toContain(
      'node --experimental-strip-types --disable-warning=ExperimentalWarning tools/mobile/android/print-emulator-api-levels.mjs)'
    );
    expect(androidWorkflow).toContain('api-level: ${{ fromJSON(needs.build.outputs.levels) }}');
    expect(androidWorkflow).toContain('api-level: ${{ matrix.api-level }}');
    expect(androidWorkflow).not.toMatch(/api-level:\s*\d+/);
  });

  it('de-duplicates the matrix when the floor reaches the current API', () => {
    expect(uniqueAndroidEmulatorApiLevels(33, 24)).toEqual([33, 24]);
    expect(uniqueAndroidEmulatorApiLevels(33, 33)).toEqual([33]);
  });

  it('propagates a resolver process failure before writing the output', () => {
    const resolverScript = workflowStepScript('Read emulator API levels').replace(
      'node --experimental-strip-types --disable-warning=ExperimentalWarning tools/mobile/android/print-emulator-api-levels.mjs',
      "node -e 'process.exit(17)'"
    );
    const result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', resolverScript],
      {
        env: { ...process.env, GITHUB_OUTPUT: '/dev/null' },
      }
    );

    expect(result.status).toBe(17);
  });

  it('reports one tag failure after the build and aggregate smoke results settle', () => {
    expect(androidWorkflow.match(/- name: File the failure/g)).toHaveLength(1);
    expect(androidWorkflow).toContain('needs: [build, smoke]');
    expect(androidWorkflow).toContain("github.event_name == 'push'");
    expect(androidWorkflow).toContain("needs.build.result != 'success'");
    expect(androidWorkflow).toContain("needs.smoke.result != 'success'");
    expect(androidWorkflow.indexOf('  report-failure:')).toBeGreaterThan(
      androidWorkflow.indexOf('  smoke:')
    );
  });

  it('gives the checkout-free failure reporter explicit repository context', () => {
    const reportJob = androidWorkflow.slice(androidWorkflow.indexOf('  report-failure:'));
    expect(reportJob).not.toContain('actions/checkout@');
    expect(reportJob).toContain('GH_REPO: ${{ github.repository }}');
    expect(reportJob.indexOf('GH_REPO: ${{ github.repository }}')).toBeLessThan(
      reportJob.indexOf('gh issue list')
    );
  });

  for (const file of ENFORCED) {
    it(`${file} carries no stale AVD/API-level literals`, () => {
      const text = read(file);
      const levels = EMULATOR_API_PATTERNS.flatMap((pattern) =>
        [...text.matchAll(pattern)].map(([, level]) => Number(level))
      );
      expect(levels.length).toBeGreaterThan(0);
      for (const level of levels) expect(level).toBe(CURRENT_ANDROID_API_LEVEL);
    });

    it(`${file} guards every current API literal`, () => {
      const text = read(file);
      const guardedOffsets = currentApiClaimOffsets(text);
      const literals = [
        ...text.matchAll(new RegExp(`API[ _](${CURRENT_ANDROID_API_LEVEL})\\b`, 'g')),
      ];

      expect(literals.length).toBeGreaterThan(0);
      for (const literal of literals) {
        expect(
          guardedOffsets,
          `${file} current API literal at offset ${literal.index} has no drift pattern`
        ).toContain(literal.index + literal[0].lastIndexOf(literal[1]));
      }
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
    'floor-validation CI claim',
    'docs/COMPATIBILITY.md',
    /the\s+Android\s+API\s+(?<api>\d+)\s+\*\*OS\s+floor\*\*\s+is\s+CI-validated/,
  ],
  [
    'tagged smoke floor claim',
    'docs/TESTING.md',
    /the\s+declared\s+API\s+(?<api>\d+)\s+floor/,
  ],
  [
    'minimum supported OS statement',
    'docs/MOBILE/android.md',
    /Minimum supported OS: \*\*Android (?<release>\d+\.\d+) \/ API (?<api>\d+)\*\*/,
  ],
  [
    'native support matrix floor row',
    'docs/MOBILE/native.md',
    /\| Android floor\s+\| Android API (?<api>\d+) on/,
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
  it('matches the reviewed permission inventory', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const permissions = [...manifest.matchAll(/<uses-permission\b([^>]*?)\/?>/g)]
      .map(([, attributes]) => ({
        name: attributes.match(/android:name="([^"]+)"/)?.[1],
        maxSdkVersion: Number(attributes.match(/android:maxSdkVersion="(\d+)"/)?.[1]) || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const expected = privacyInventory.permissions.android
      .map(({ name, maxSdkVersion = null }) => ({ name, maxSdkVersion }))
      .sort((a, b) => a.name.localeCompare(b.name));

    expect(permissions).toEqual(expected);
  });

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
