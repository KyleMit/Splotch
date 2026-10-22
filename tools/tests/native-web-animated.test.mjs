// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import ReactNativeWebAnimated from 'react-native-web/dist/exports/Animated/index.js';
import ReactNativeWebEasing from 'react-native-web/dist/exports/Easing/index.js';
import AnimatedImplementation from 'react-native-web/dist/vendor/react-native/Animated/AnimatedImplementation.js';
import { ROOT } from '../lib/proc.mjs';

// Metro resolves react-native to React Native Web for the web export.
vi.mock('react-native', async () => ({
  Easing: (await import('react-native-web/dist/exports/Easing/index.js')).default,
}));
const { Animated, Easing } = await import('../../src/platform/animated.web.ts');

const SRC = join(ROOT, 'src');
const PLATFORM_ANIMATED = ['platform/animated.ts', 'platform/animated.web.ts'];
const REACT_NATIVE_WEB_ANIMATED = join(
  ROOT,
  'node_modules/react-native-web/dist/vendor/react-native/Animated/Animated.js'
);
// The host components React Native Web's Animated export spreads over its implementation; only
// View is animated anywhere in the app.
const LIST_AND_TEXT_HOSTS = ['FlatList', 'SectionList', 'ScrollView', 'Image', 'Text'];
const ANIMATION_IMPORT =
  /(?:import|export)\s*\{[^}]*\b(?:Animated|Easing)\b[^}]*\}\s*from\s*'react-native'/;
const ANIMATED_HOST = new RegExp(`\\bAnimated\\.(?:${LIST_AND_TEXT_HOSTS.join('|')})\\b`);

function sources(directory = SRC) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [relative(SRC, path)] : [];
  });
}

describe('the web export’s Animated', () => {
  it('is React Native Web’s own animation driver and animated View', () => {
    const exported = Object.keys(ReactNativeWebAnimated).filter(
      (key) => !LIST_AND_TEXT_HOSTS.includes(key)
    );
    expect(exported).toContain('timing');
    expect(Object.keys(Animated).sort()).toEqual(exported.sort());
    expect(Animated.View).toBe(ReactNativeWebAnimated.View);
    for (const key of Object.keys(AnimatedImplementation))
      expect(Animated[key], key).toBe(AnimatedImplementation[key]);
    // Outside tests React Native Web exports this implementation; under NODE_ENV=test it swaps in
    // AnimatedMock, which is why the values above compare against the implementation itself.
    expect(readFileSync(REACT_NATIVE_WEB_ANIMATED, 'utf8')).toContain(
      'Platform.isTesting ? AnimatedMock : AnimatedImplementation'
    );
  });

  it('eases with React Native Web’s Easing', () => {
    expect(Easing).toBe(ReactNativeWebEasing);
  });

  it('leaves out the list and text hosts that pull in VirtualizedList', () => {
    for (const host of LIST_AND_TEXT_HOSTS) expect(Animated).not.toHaveProperty(host);
  });

  it('is the only way app code reaches Animated or Easing', () => {
    const offenders = sources().filter(
      (path) => !PLATFORM_ANIMATED.includes(path) && ANIMATION_IMPORT.test(read(path))
    );
    expect(offenders).toEqual([]);
    expect(read(PLATFORM_ANIMATED[0])).toMatch(ANIMATION_IMPORT);
  });

  it('never animates a host the web export leaves out', () => {
    expect(sources().filter((path) => ANIMATED_HOST.test(read(path)))).toEqual([]);
    expect('<Animated.ScrollView />').toMatch(ANIMATED_HOST);
  });
});

function read(path) {
  return readFileSync(join(SRC, path), 'utf8');
}
