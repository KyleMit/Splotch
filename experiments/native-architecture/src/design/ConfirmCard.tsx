import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { colors, dimensions, fonts } from '../rsdDrawing/tokens.css';

// app.css .confirm-card and its heading, and the confirm dialogs' action row. Exported for
// native-design-primitives-drift.test.mjs, which reads each from shipping. Title and copy are one
// group, so they sit closer than the card's own rhythm separates the groups.
export const CONFIRM_CARD_MAX_WIDTH_PX = 336;
export const CONFIRM_HEADING_GAP_PX = 6;
export const CONFIRM_TITLE_LINE_HEIGHT = 1.2;
export const CONFIRM_COPY_LINE_HEIGHT = 1.45;
export const CONFIRM_ACTION_BASIS_PX = 140;

const styles = css.create({
  card: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: CONFIRM_CARD_MAX_WIDTH_PX,
    paddingTop: dimensions.space6,
    paddingInline: dimensions.space6,
    paddingBottom: dimensions.space5,
    gap: dimensions.space4,
  },
  heading: { display: 'flex', flexDirection: 'column', gap: CONFIRM_HEADING_GAP_PX },
  title: {
    margin: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeXl,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    lineHeight: CONFIRM_TITLE_LINE_HEIGHT,
  },
  copy: {
    margin: 0,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    lineHeight: CONFIRM_COPY_LINE_HEIGHT,
  },
  // Wraps to a column on the narrowest phones rather than truncating either label.
  actions: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space2 },
  action: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: CONFIRM_ACTION_BASIS_PX,
  },
});

// The shipping two-choice confirm card's content: a title and its consequence, then two actions
// side by side. The caller supplies the actions, the safe choice first so a stray press stays,
// and the dialog that hosts the card names itself from the same title.
export function ConfirmCard({
  title,
  copy,
  actions,
}: {
  title: string;
  copy: string;
  actions: readonly [ReactNode, ReactNode];
}) {
  return (
    <html.div style={styles.card}>
      <html.div style={styles.heading}>
        <html.h2 style={styles.title}>{title}</html.h2>
        <html.p style={styles.copy}>{copy}</html.p>
      </html.div>
      <html.div style={styles.actions}>
        {actions.map((action, index) => (
          <html.div key={index} style={styles.action}>
            {action}
          </html.div>
        ))}
      </html.div>
    </html.div>
  );
}
