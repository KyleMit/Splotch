import { createElement, StrictMode } from 'react';
import { registerRootComponent } from '../platform/registerRoot';
import { PageDocument, pageIconsSettled } from './PageDocument';

// The page documents' own entry, which tools/migration/prerender-native-web-pages.mjs bundles
// beside the drawing screen's export: a page document loads none of the drawing screen's bundle,
// and its drift guard holds the drawing screen's module graph to none of this directory.
function StrictPageDocument() {
  return createElement(StrictMode, null, createElement(PageDocument));
}
void pageIconsSettled().then(() =>
  registerRootComponent(__DEV__ ? StrictPageDocument : PageDocument)
);
