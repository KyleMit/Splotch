import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

// The installed native sources the dependency patches correct; neither has a unit harness, so
// these hold each fix in place across reinstalls and version bumps.
const require = createRequire(import.meta.url);
const installed = (name, path) =>
  readFileSync(join(dirname(require.resolve(`${name}/package.json`)), path), 'utf8');

it('skips a synchronous Reanimated prop update for a view that is no longer mounted', () => {
  const proxy = installed(
    'react-native-reanimated',
    'android/src/main/java/com/swmansion/reanimated/NativeProxy.kt'
  );
  const update = proxy.slice(proxy.indexOf('fun synchronouslyUpdateUIProps('));
  const guard = update.indexOf('getViewExistsMethod?.invoke(mountingManager, viewTag) == false');
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(update.indexOf('updatePropsSynchronouslyMethod.invoke'));
});

it('locks iOS orientation without the UIDevice orientation setter UIKit rejects', () => {
  const registry = installed('expo-screen-orientation', 'ios/ScreenOrientationRegistry.swift');
  expect(registry).toMatch(
    /requestGeometryUpdate\(\.iOS\(interfaceOrientations: orientationMask\)\)/
  );
  expect(registry).not.toMatch(/UIDevice\.current\.setValue/);
});
