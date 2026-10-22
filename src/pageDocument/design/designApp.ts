import { createElement, StrictMode } from 'react';
import { registerRootComponent } from '../../platform/registerRoot';
import { DesignDocument } from './DesignDocument';
import { deferredIconsSettled } from '../../rsdDrawing/iconRegistry';

// The styleguide's own entry, which tools/migration/prerender-native-web-pages.mjs bundles beside
// the information pages' entry: no information page loads its specimens, and the drawing screen's
// drift guard holds its module graph to none of this directory.
function StrictDesignDocument() {
  return createElement(StrictMode, null, createElement(DesignDocument));
}
// The specimens draw the icon set the drawing screen loads after it paints; the entry hydrates only
// once it is in, as the build renders it.
void deferredIconsSettled().then(() =>
  registerRootComponent(__DEV__ ? StrictDesignDocument : DesignDocument)
);
