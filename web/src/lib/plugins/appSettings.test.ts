// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const JS_NAME = 'AppSettings';

// Capacitor 8 registers neither platform's app-local plugins on its own, and a plugin that is
// declared but never registered only fails when a parent taps Open Settings on a device.
describe('the AppSettings native plugin', () => {
  it('is registered under its JS name on Android', () => {
    const plugin = sourceFile(
      '../../../../android/app/src/main/java/art/splotch/app/AppSettingsPlugin.java'
    );
    const activity = sourceFile(
      '../../../../android/app/src/main/java/art/splotch/app/MainActivity.java'
    );

    expect(plugin).toContain(`@CapacitorPlugin(name = "${JS_NAME}")`);
    expect(plugin).toContain('public void open(PluginCall call)');
    expect(activity).toContain('registerPlugin(AppSettingsPlugin.class);');
  });

  it('is registered under its JS name and compiled into the app on iOS', () => {
    const plugin = sourceFile('../../../../ios/App/App/AppSettingsPlugin.swift');
    const controller = sourceFile('../../../../ios/App/App/MainViewController.swift');
    const project = sourceFile('../../../../ios/App/App.xcodeproj/project.pbxproj');

    expect(plugin).toContain(`public let jsName = "${JS_NAME}"`);
    expect(plugin).toContain('CAPPluginMethod(name: "open"');
    expect(controller).toContain('bridge.registerPluginInstance(AppSettingsPlugin())');
    expect(project).toMatch(/AppSettingsPlugin\.swift in Sources \*\/,/);
  });

  it('registers the JS proxy under the same name', () => {
    expect(sourceFile('./appSettings.ts')).toContain(
      `registerPlugin<AppSettingsPlugin>('${JS_NAME}')`
    );
  });
});
