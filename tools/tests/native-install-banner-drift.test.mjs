import { expect, it, vi } from 'vitest';

import { INSTALL_BANNER_PARTS, iosBannerStepParts } from '../../src/install/installCopy.ts';

vi.mock('react-native', () => {
  const curve = () => (t) => t;
  return {
    AccessibilityInfo: {},
    Animated: { View: () => null, createAnimatedComponent: (component) => component },
    Easing: { back: curve, cubic: (t) => t, in: curve, linear: (t) => t, out: curve },
    Platform: { OS: 'web' },
    Pressable: () => null,
    ScrollView: () => null,
    StyleSheet: { create: (styles) => styles },
    Text: () => null,
    TextInput: () => null,
    View: () => null,
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width: 0, height: 0 }),
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));
vi.mock('react-strict-dom', () => ({
  compat: { native: () => null },
  css: { create: (styles) => styles, defineVars: (vars) => vars, createTheme: () => ({}) },
  html: {},
}));
const parts = [
  ...iosBannerStepParts('{shareLocation}').flat(),
  ...INSTALL_BANNER_PARTS.androidHint,
  ...INSTALL_BANNER_PARTS.parting,
];

it('sets the same icon beside each term', () => {
  const terms = parts.filter((part) => part.kind === 'term');
  expect(terms).toEqual([
    { kind: 'term', icon: 'share-ios', text: ' Share' },
    { kind: 'term', icon: 'add-homescreen', text: ' Add to Home Screen' },
    { kind: 'term', icon: 'chevron-down', text: ' View More' },
    { kind: 'term', icon: 'more-vert', text: ' menu', spoken: 'three-dot', textInk: true },
  ]);
});

it('sets the same icon before the bold word in the parting message', () => {
  const icons = parts.filter((part) => part.kind === 'icon');
  expect(icons).toEqual([{ kind: 'icon', icon: 'settings' }]);
});
