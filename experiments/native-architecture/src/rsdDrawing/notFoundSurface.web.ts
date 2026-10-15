import { createElement } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdNotFoundPage as Page } from './RsdNotFoundPage';

const page = createLazyExport(() =>
  import('./RsdSettingsRoute').then((module) => module.RsdNotFoundPage)
);
const whole = (loaded: typeof Page) => loaded;

// PageShell is also used by the internal reading pages, so every page loads through Settings'
// chunk entry; a second entry would hoist their shared shell onto the drawing startup path.
export function RsdNotFoundPage() {
  const Loaded = useLazyValue(page, whole, 'The not-found page');
  return Loaded ? createElement(Loaded) : null;
}
