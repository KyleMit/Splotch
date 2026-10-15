import { createElement, type ComponentProps } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdInformationPage as Page } from './RsdInformationPage';
// Internal pages share Settings' chunk entry so Metro keeps their shared forms, gate and release
// notes lazy. check-native-web-precache.mjs guards the release-history startup boundary.
const page = createLazyExport(() =>
  import('./RsdSettingsRoute').then((module) => module.RsdInformationPage)
);
const whole = (loaded: typeof Page) => loaded;
export function RsdInformationPage(props: ComponentProps<typeof Page>) {
  const Loaded = useLazyValue(page, whole, 'The information page');
  return Loaded ? createElement(Loaded, props) : null;
}
