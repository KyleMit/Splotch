import { renderToString } from 'react-dom/server';
import { Dimensions } from 'react-native';
import AppRegistry from 'expo/src/launch/AppRegistry.web';
import type { DocumentPage } from '../information/appPages';
import { pageDocumentInputs } from './appDocument';
import { prerenderInputs } from '../platform/prerenderInputs';
import { getSheet } from '../platform/reactNativeWebSheet';
import { shippingFontFaceRules } from '../platform/shippingFont.web';
import type { FirstFrameViewport } from '../prerenderFirstFrame';
import { DOCUMENT_TITLES } from '../rsdDrawing/RsdInformationPage';
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
  page: DocumentPage;
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

export function pageDocumentHead(page: DocumentPage) {
  return { title: DOCUMENT_TITLES[page], fontFaceRules: shippingFontFaceRules() };
}
