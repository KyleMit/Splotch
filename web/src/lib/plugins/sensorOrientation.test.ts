// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

// registration.test.ts guards the plugin's JS name and registration; this guards what it requests.
describe('the SensorOrientation native plugin', () => {
  it('follows the accelerometer past the Auto-rotate toggle, never into upside-down portrait', () => {
    const plugin = sourceFile(
      '../../../../android/app/src/main/java/art/splotch/app/SensorOrientationPlugin.java'
    );

    expect(plugin).toContain('ActivityInfo.SCREEN_ORIENTATION_SENSOR)');
  });
});
