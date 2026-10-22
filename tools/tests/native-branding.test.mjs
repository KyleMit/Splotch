import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../lib/proc.mjs';

const NATIVE_RES = 'android/app/src/main/res';
const NATIVE_IOS = 'ios';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

describe('native launcher icon and splash', () => {
  it('wires the committed resources into both native projects', () => {
    expect(read(`${NATIVE_RES}/values/styles.xml`)).toMatch(
      /<style name="Theme\.App\.SplashScreen"[^>]*>\s*<item name="android:windowBackground">@drawable\/splash<\/item>/
    );
    const manifest = read('android/app/src/main/AndroidManifest.xml');
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
});
