import { css } from 'react-strict-dom';
import { scale } from '../../../../web/src/lib/design/tokens';

// A WebView sets shipping's HubList rows, <button>s that never inherit the app font, in the system
// face: San Francisco in WebKit, Roboto in Android's Chromium. 'system-ui' names it on both: iOS
// resolves it itself, and Android's MainApplication registers it as the system typeface so it takes
// a real weight, not one of the app font's per-weight families.
export const hubRowFace = css.create({
  tile: { flexWrap: 'wrap' },
  row: { fontFamily: 'system-ui', flexWrap: 'wrap' },
  title: { fontWeight: scale.fontWeightSemibold },
});
