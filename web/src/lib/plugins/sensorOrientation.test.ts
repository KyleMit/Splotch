// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const JS_NAME = 'SensorOrientation';

// Capacitor 8 does not register app-local plugins on its own, and a plugin that is declared but
// never registered only fails when a parent picks Auto on a device.
describe('the SensorOrientation native plugin', () => {
  it('is registered under its JS name on Android', () => {
    const plugin = sourceFile(
      '../../../../android/app/src/main/java/art/splotch/app/SensorOrientationPlugin.java'
    );
    const activity = sourceFile(
      '../../../../android/app/src/main/java/art/splotch/app/MainActivity.java'
    );

    expect(plugin).toContain(`@CapacitorPlugin(name = "${JS_NAME}")`);
    expect(plugin).toContain('public void followSensor(PluginCall call)');
    expect(plugin).toContain('ActivityInfo.SCREEN_ORIENTATION_SENSOR)');
    expect(activity).toContain('registerPlugin(SensorOrientationPlugin.class);');
  });

  it('registers the JS proxy under the same name', () => {
    expect(sourceFile('./sensorOrientation.ts')).toContain(
      `registerPlugin<SensorOrientationPlugin>('${JS_NAME}')`
    );
  });
});
