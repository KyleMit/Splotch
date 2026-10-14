import { createElement } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdNotFoundPage as Page } from './RsdNotFoundPage';

const page = createLazyExport(() =>
  import('./RsdNotFoundPage').then((module) => module.RsdNotFoundPage)
);
const whole = (loaded: typeof Page) => loaded;

// A stray link is the only way here, so the drawing screen's startup carries none of the page.
export function RsdNotFoundPage() {
  const Loaded = useLazyValue(page, whole, 'The not-found page');
  return Loaded ? createElement(Loaded) : null;
}
