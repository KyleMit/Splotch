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

  it('lets Capacitor reconcile native padding and CSS insets with the cover viewport from startup', () => {
    expect(config.plugins.SystemBars).toEqual({
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    });
    expect(read('web/src/app.html')).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(activity).not.toContain('setOnApplyWindowInsetsListener');
  });

  it('retains short-edge cutouts and transient navigation hiding on focus re-entry', () => {
    expect(activity).toContain(
      'WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES'
    );
    expect(activity).toMatch(/if \(hasFocus\)\s*\{\s*hideNavigationBar\(\);/);
    expect(activity).toContain('controller.hide(WindowInsetsCompat.Type.navigationBars())');
    expect(activity).toContain(
      'WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE'
    );
  });
});
