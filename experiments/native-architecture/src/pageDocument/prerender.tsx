import { renderToString } from 'react-dom/server';
import { Dimensions } from 'react-native';
import AppRegistry from 'expo/src/launch/AppRegistry.web';
import { pageDocumentInputs, type DocumentContent } from './appDocument';
import { NOT_FOUND_DOCUMENT } from './appDocumentContract';
import { BETA_DOCUMENT_HEAD } from './BetaPage';
import { prerenderInputs } from '../platform/prerenderInputs';
import { getSheet } from '../platform/reactNativeWebSheet';
import { shippingFontFaceRules } from '../platform/shippingFont.web';
import type { FirstFrameViewport } from '../prerenderFirstFrame';
import { DOCUMENT_TITLES } from '../rsdDrawing/RsdInformationPage';
import { NOT_FOUND_COPY } from '../rsdDrawing/RsdNotFoundPage';
import type { AppearancePreference } from '../settings/appearance';
import { PageDocument } from './PageDocument';
export { pageIconsSettled } from './PageDocument';

// The build bundles this module for Node (tools/migration/prerender-native-web-pages.mjs) and
// writes each page document's markup from it, through the same AppRegistry the page entry
// (pageApp.ts) hydrates with, as prerenderFirstFrame.tsx does for the drawing screen.
const APP_KEY = 'main';

AppRegistry.registerComponent(APP_KEY, () => PageDocument);

export function prerenderPage({
  page,
  viewport,
  appearance,
}: {
  page: DocumentContent;
  viewport: FirstFrameViewport;
  appearance: AppearancePreference;
}) {
  const window = { ...viewport, fontScale: 1 };
  Dimensions.set({ window, screen: window });
  prerenderInputs.appearance = appearance;
  pageDocumentInputs.page = page;
  const { element } = AppRegistry.getApplication(APP_KEY);
  const html = renderToString(element);
  return { html, sheet: getSheet() };
}

// Each document's <title>, and the tags its page adds to the export's head.
function documentHead(page: DocumentContent) {
  if (page === NOT_FOUND_DOCUMENT) return { title: NOT_FOUND_COPY.documentTitle, head: '' };
  if (page === 'beta') return BETA_DOCUMENT_HEAD;
  return { title: DOCUMENT_TITLES[page], head: '' };
}

export function pageDocumentHead(page: DocumentContent) {
  return { ...documentHead(page), fontFaceRules: shippingFontFaceRules() };
}
