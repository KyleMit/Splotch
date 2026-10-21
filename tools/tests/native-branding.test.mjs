import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../lib/proc.mjs';
import {
  generateNativeBranding,
  NATIVE_LAUNCH_SCREEN,
  nativeBrandingDrift,
  nativeBrandingPairs,
} from '../migration/gen-native-branding.mjs';

const NATIVE_RES = 'experiments/native-architecture/android/app/src/main/res';
const NATIVE_IOS = 'experiments/native-architecture/ios';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const fixtures = [];

const SHIPPING_FIXTURE = [
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
  'android/app/src/main/res/drawable/ic_launcher_monochrome.xml',
  'android/app/src/main/res/drawable-port-night-hdpi/splash.png',
  'android/app/src/main/res/values/styles.xml',
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany-dark.png',
  NATIVE_LAUNCH_SCREEN.shipping,
];
const NATIVE_ONLY = `${NATIVE_RES}/values/strings.xml`;

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-native-branding-'));
  fixtures.push(root);
  for (const path of SHIPPING_FIXTURE) write(root, path, `shipping ${path}`);
  write(root, `${NATIVE_RES}/mipmap-hdpi/ic_launcher.webp`, 'template launcher');
  write(root, NATIVE_ONLY, 'native strings');
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native launcher icon and splash copied from the shipping Capacitor assets', () => {
  it('pins every committed native branding file to its shipping bytes', () => {
    expect(nativeBrandingDrift(ROOT)).toEqual([]);
    const native = nativeBrandingPairs(ROOT).map((pair) => pair.native);
    expect(native).toEqual(
      expect.arrayContaining([
        `${NATIVE_RES}/mipmap-anydpi-v26/ic_launcher.xml`,
        `${NATIVE_RES}/mipmap-anydpi-v26/ic_launcher_round.xml`,
        `${NATIVE_RES}/mipmap-xxxhdpi/ic_launcher_foreground.png`,
        `${NATIVE_RES}/drawable/ic_launcher_monochrome.xml`,
        `${NATIVE_RES}/drawable/splash.png`,
        `${NATIVE_RES}/drawable-land-night-xxhdpi/splash.png`,
        `${NATIVE_IOS}/Splotch/Images.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`,
        `${NATIVE_IOS}/Splotch/Images.xcassets/Splash.imageset/Default@3x~universal~anyany-dark.png`,
        NATIVE_LAUNCH_SCREEN.native,
      ])
    );
  });

  it('wires the copied resources into both native projects', () => {
    expect(read(`${NATIVE_RES}/values/styles.xml`)).toMatch(
      /<style name="Theme\.App\.SplashScreen"[^>]*>\s*<item name="android:windowBackground">@drawable\/splash<\/item>/
    );
    const manifest = read(
      'experiments/native-architecture/android/app/src/main/AndroidManifest.xml'
    );
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    expect(manifest).toContain('android:theme="@style/Theme.App.SplashScreen"');
    expect(read(`${NATIVE_IOS}/Splotch/Info.plist`)).toMatch(
      /<key>UILaunchStoryboardName<\/key>\s*<string>SplashScreen<\/string>/
    );
    expect(read(`${NATIVE_IOS}/Splotch.xcodeproj/project.pbxproj`)).toContain(
      'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;'
    );
  });

  it('copies branding, drops stale template files, and leaves native-only resources alone', () => {
    const root = createFixture();
    expect(generateNativeBranding([], root)).toEqual({ files: SHIPPING_FIXTURE.length - 1 });
    expect(nativeBrandingDrift(root)).toEqual([]);
    expect(existsSync(join(root, `${NATIVE_RES}/mipmap-hdpi/ic_launcher.webp`))).toBe(false);
    expect(existsSync(join(root, `${NATIVE_RES}/values/styles.xml`))).toBe(false);
    expect(readFileSync(join(root, NATIVE_ONLY), 'utf8')).toBe('native strings');
    expect(readFileSync(join(root, NATIVE_LAUNCH_SCREEN.native), 'utf8')).toBe(
      `shipping ${NATIVE_LAUNCH_SCREEN.shipping}`
    );
  });

  it('fails the check when a native copy diverges or outlives its shipping file', () => {
    const root = createFixture();
    generateNativeBranding([], root);
    const splash = `${NATIVE_RES}/drawable-port-night-hdpi/splash.png`;
    write(root, splash, 'edited splash');
    write(root, `${NATIVE_RES}/mipmap-xxhdpi/ic_launcher_round.webp`, 'template launcher');
    rmSync(
      join(root, `${NATIVE_IOS}/Splotch/Images.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`)
    );
    expect(nativeBrandingDrift(root)).toEqual([
      `differs from shipping: ${splash}`,
      `differs from shipping: ${NATIVE_IOS}/Splotch/Images.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`,
      `no shipping counterpart: ${NATIVE_RES}/mipmap-xxhdpi/ic_launcher_round.webp`,
    ]);
    expect(() => generateNativeBranding(['--check'], root)).toThrow(
      `differs from shipping: ${splash}`
    );
    expect(readFileSync(join(root, splash), 'utf8')).toBe('edited splash');
  });

  it('rejects unsupported generator arguments before changing files', () => {
    const root = createFixture();
    expect(() => generateNativeBranding(['--write'], root)).toThrow('Only --check is supported.');
    expect(existsSync(join(root, `${NATIVE_RES}/mipmap-hdpi/ic_launcher.webp`))).toBe(true);
  });
});
