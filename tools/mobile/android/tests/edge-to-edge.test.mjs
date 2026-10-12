import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');
const activity = read('android/app/src/main/java/art/splotch/app/MainActivity.java');
const config = JSON.parse(read('capacitor.config.json'));

describe('Android edge-to-edge startup contract', () => {
  it('enables AndroidX edge-to-edge after bridge creation and before immersive navigation', () => {
    const startup = activity.slice(
      activity.indexOf('public void onCreate('),
      activity.indexOf('public void onConfigurationChanged(')
    );
    expect(startup).toMatch(
      /super\.onCreate\(savedInstanceState\);\s*WindowCompat\.enableEdgeToEdge\(getWindow\(\)\);/
    );
    expect(startup.indexOf('hideNavigationBar();')).toBeGreaterThan(
      startup.indexOf('WindowCompat.enableEdgeToEdge(')
    );
  });

  it('preserves the system contrast scrim for transient three-button navigation', () => {
    expect(activity).toMatch(
      /WindowCompat\.enableEdgeToEdge\(getWindow\(\)\);\s*preserveNavigationBarContrast\(\);/
    );
    expect(activity).toMatch(
      /if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.Q\)\s*\{\s*getWindow\(\)\.setNavigationBarContrastEnforced\(true\);/
    );
  });

  it('lets Capacitor reconcile native padding and CSS insets with the cover viewport from startup', () => {
    expect(config.plugins.SystemBars).toEqual({
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    });
    expect(read('web/src/app.html')).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(activity).not.toContain('setOnApplyWindowInsetsListener');
  });

  it('delegates cutout and color compatibility to AndroidX and keeps transient navigation re-entry', () => {
    expect(activity).not.toContain('LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES');
    expect(activity).not.toContain('layoutInDisplayCutoutMode');
    expect(activity).not.toContain('setNavigationBarColor');
    expect(activity).toMatch(/if \(hasFocus\)\s*\{\s*hideNavigationBar\(\);/);
    expect(activity).toContain('controller.hide(WindowInsetsCompat.Type.navigationBars())');
    expect(activity).toContain(
      'WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE'
    );
  });
});


describe('native SystemBars dependency contract', () => {
  it('removes the legacy StatusBar plugin from both native dependency graphs', () => {
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.dependencies).not.toHaveProperty('@capacitor/status-bar');
    expect(packageJson.devDependencies).not.toHaveProperty('@capacitor/status-bar');
    expect(read('pnpm-lock.yaml')).not.toContain('@capacitor/status-bar');
    expect(read('ios/App/CapApp-SPM/Package.swift')).not.toContain('CapacitorStatusBar');
  });

  it('keeps native status-bar loading behind the compile-time bundle boundary', () => {
    const component = read('web/src/lib/components/NotchBand.svelte');
    expect(component).toMatch(/if \(!__IS_CAPACITOR__ \|\| !isNative\(\)\) return;\s*import\('@capacitor\/core'\)/);
    expect(component).not.toContain('@capacitor/status-bar');
    expect(read('web/src/lib/platform/notchBand.ts')).toMatch(/import type .* from '@capacitor\/core'/);
    expect(read('ios/App/App/Info.plist')).toMatch(/<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<true\/>/);
  });
});
