import { css } from 'react-strict-dom';
import { scale } from '../lib/design/tokens';

// A WebView sets shipping's HubList rows, <button>s that never inherit the app font, in the system
// face: San Francisco in WebKit, Roboto in Android's Chromium. 'system-ui' names it on both: iOS
// resolves it itself, and Android's MainApplication registers it as the system typeface so it takes
// a real weight, not one of the app font's per-weight families.
export const hubRowFace = css.create({
  tile: { flexWrap: 'wrap' },
  row: { fontFamily: 'system-ui', flexWrap: 'wrap' },
  title: { fontWeight: scale.fontWeightSemibold },
});

const minimum = css.create({
  row: (width: number) => ({ minWidth: width }),
});

export function hubRowMinWidth(wordWidth: number) {
  return minimum.row(wordWidth + Number.parseFloat(scale.space4) * 2);
}

export function hubTextMinWidth(wordWidth: number) {
  return minimum.row(wordWidth);
}

// The widest a title can be laid out: the tile less the row's padding on either side.
export function hubTitleRoom(tileWidth: number) {
  return tileWidth - Number.parseFloat(scale.space4) * 2;
}
