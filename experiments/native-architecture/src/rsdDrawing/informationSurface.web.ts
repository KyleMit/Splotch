import { createElement, type ComponentProps } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdInformationPage as Page } from './RsdInformationPage';
const page = createLazyExport(() =>
  import('./RsdInformationPage').then((module) => module.RsdInformationPage)
);
const whole = (loaded: typeof Page) => loaded;
export function RsdInformationPage(props: ComponentProps<typeof Page>) {
  const Loaded = useLazyValue(page, whole, 'The information page');
  return Loaded ? createElement(Loaded, props) : null;
}
