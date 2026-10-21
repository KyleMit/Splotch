import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const nativeManifest = read(
  'experiments/native-architecture/android/app/src/main/AndroidManifest.xml'
);
const shippingManifest = read('android/app/src/main/AndroidManifest.xml');

// The drawing and its Undo history live in the activity's React tree, so every configuration
// change Android handles by recreating MainActivity erases them (issue 3135). Shipping's
// Capacitor activity survives its own list; the native app also follows the OS text settings
// shipping's WebView ignores.
const NATIVE_ONLY_CONFIG_CHANGES = [
  // Settings › Display › Font size; text relays out live (DEVELOPMENT.md, "Large OS text").
  'fontScale',
  // Settings › Accessibility › Bold text; the new weight applies at the next launch.
  'fontWeightAdjustment',
  // Arrives with a change to or from a right-to-left locale.
  'layoutDirection',
];

function mainActivityConfigChanges(manifest) {
  const activity = manifest
    .match(/<activity\b[^>]*>/g)
    ?.find((tag) => /android:name="[^"]*\.MainActivity"/.test(tag));
  expect(activity).toBeDefined();
  const value = activity.match(/android:configChanges="([^"]*)"/)?.[1];
  expect(value).toBeDefined();
  return value.split('|');
}

describe('MainActivity survives the configuration changes a parent can make mid-drawing', () => {
  it('declares every change shipping declares', () => {
    expect(mainActivityConfigChanges(nativeManifest)).toEqual(
      expect.arrayContaining(mainActivityConfigChanges(shippingManifest))
    );
  });

  it('declares the font-size, bold-text and layout-direction changes too', () => {
    expect(mainActivityConfigChanges(nativeManifest)).toEqual(
      expect.arrayContaining(NATIVE_ONLY_CONFIG_CHANGES)
    );
  });

  it('declares each change once', () => {
    const changes = mainActivityConfigChanges(nativeManifest);
    expect(new Set(changes).size).toBe(changes.length);
  });
});
