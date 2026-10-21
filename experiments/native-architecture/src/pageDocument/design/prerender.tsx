import { renderToString } from 'react-dom/server';
import { Dimensions } from 'react-native';
import AppRegistry from 'expo/src/launch/AppRegistry.web';
import type { WebDocument } from '../../information/unlinkedDocuments';
import { prerenderInputs } from '../../platform/prerenderInputs';
import { getSheet } from '../../platform/reactNativeWebSheet';
import { shippingFontFaceRules } from '../../platform/shippingFont.web';
import type { FirstFrameViewport } from '../../prerenderFirstFrame';
import type { AppearancePreference } from '../../settings/appearance';
import { DesignDocument } from './DesignDocument';
import { DESIGN_COPY } from './designSections';
export { deferredIconsSettled as pageIconsSettled } from '../../rsdDrawing/iconRegistry';

// The build bundles this module for Node (tools/migration/prerender-native-web-pages.mjs) and
// writes the styleguide's document from it, through the same AppRegistry its entry (designApp.ts)
// hydrates with, as the information pages' render module (../prerender.tsx) does. It takes the
// same arguments as that module, and the styleguide is the only document it writes.
const APP_KEY = 'main';

AppRegistry.registerComponent(APP_KEY, () => DesignDocument);

export function prerenderPage({
  viewport,
  appearance,
}: {
  page: WebDocument;
  viewport: FirstFrameViewport;
  appearance: AppearancePreference;
}) {
  const window = { ...viewport, fontScale: 1 };
  Dimensions.set({ window, screen: window });
  prerenderInputs.appearance = appearance;
  const { element } = AppRegistry.getApplication(APP_KEY);
  const html = renderToString(element);
  return { html, sheet: getSheet() };
}

export function pageDocumentHead() {
  return { title: DESIGN_COPY.documentTitle, fontFaceRules: shippingFontFaceRules() };
}
