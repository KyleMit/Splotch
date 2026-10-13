import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';

// A browser draws an outside list marker in the list's start padding and ends it a little short of
// the item text; React Native draws no list markers at all, so the list draws its own in that
// padding on every platform. The bullet is a filled disc sized to the text, as the browser's is.
const MARKER_GAP_PX = 6;
const BULLET_EM = 0.32;

const styles = css.create({
  list: { display: 'flex', flexDirection: 'column', margin: 0, padding: 0, listStyle: 'none' },
  item: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start' },
  marker: (indentPx: number, lineHeightPx: number) => ({
    boxSizing: 'border-box',
    flexShrink: 0,
    width: indentPx,
    height: lineHeightPx,
    paddingRight: MARKER_GAP_PX,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  }),
  numeral: { fontVariant: 'tabular-nums' },
  bullet: (px: number, color: string) => ({
    width: px,
    height: px,
    borderRadius: px,
    backgroundColor: color,
  }),
  text: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  spaced: (gapPx: number) => ({ marginTop: gapPx }),
});

// An ordered or bulleted list whose items wrap under their own text rather than under the marker.
// The caller passes each item's content and the text metrics the markers align to.
export function RsdList({
  ordered,
  fontSizePx,
  lineHeightPx,
  indentPx,
  gapPx,
  markerColor,
  items,
}: {
  ordered: boolean;
  fontSizePx: number;
  lineHeightPx: number;
  indentPx: number;
  gapPx: number;
  markerColor: string;
  items: readonly ReactNode[];
}) {
  const List = ordered ? html.ol : html.ul;
  const bulletPx = Math.round(fontSizePx * BULLET_EM);
  return (
    <List style={styles.list}>
      {items.map((item, index) => (
        <html.li key={index} style={[styles.item, index > 0 && styles.spaced(gapPx)]}>
          <html.div aria-hidden style={styles.marker(indentPx, lineHeightPx)}>
            {ordered ? (
              <html.span style={styles.numeral}>{`${index + 1}.`}</html.span>
            ) : (
              <html.div style={styles.bullet(bulletPx, markerColor)} />
            )}
          </html.div>
          <html.span style={styles.text}>{item}</html.span>
        </html.li>
      ))}
    </List>
  );
}
