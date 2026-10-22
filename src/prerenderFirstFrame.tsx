import { renderToString } from 'react-dom/server';
import { Dimensions } from 'react-native';
import AppRegistry from 'expo/src/launch/AppRegistry.web';
import { getSheet } from './platform/reactNativeWebSheet';
import { prerenderInputs } from './platform/prerenderInputs';
import type { AppearancePreference } from './settings/appearance';
import { ProbeApp } from './ProbeApp';

// The build bundles this module for Node (tools/migration/prerender-native-web.mjs) and writes the
// drawing screen's first frame into the exported index.html. It renders the root that Expo's web
// launcher (registerRoot.web.ts) then hydrates, through the same AppRegistry, so the server tree
// and the client's first render are the same element.
const APP_KEY = 'main';

AppRegistry.registerComponent(APP_KEY, () => ProbeApp);

export type FirstFrameViewport = Readonly<{ width: number; height: number; scale: number }>;

export function prerenderFirstFrame({
  viewport,
  appearance,
}: {
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
