import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { colors, dimensions, fonts } from './tokens.css';
import { spokenText, useAnnouncement } from './useAnnouncement';

export type MessageStatus = 'success' | 'error' | 'warning';

// StatusMessage.svelte's line heights: the warning sets slightly tighter under its medium weight.
// Exported for native-design-primitives-drift.test.mjs, which reads both from shipping.
export const STATUS_LINE_HEIGHT = 1.5;
export const STATUS_WARNING_LINE_HEIGHT = 1.45;

const styles = css.create({
  message: {
    margin: 0,
    paddingBlock: dimensions.space2,
    paddingInline: dimensions.space3,
    borderRadius: dimensions.radiusSm,
    fontSize: dimensions.fontSizeSm,
    lineHeight: STATUS_LINE_HEIGHT,
  },
  success: { backgroundColor: colors.successWash, color: colors.successText },
  error: { backgroundColor: colors.dangerWash, color: colors.dangerText },
  warning: {
    backgroundColor: colors.warningWash,
    color: colors.warningText,
    lineHeight: STATUS_WARNING_LINE_HEIGHT,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
});

// Errors interrupt (alert, assertive); successes and warnings queue behind whatever is speaking.
const LIVE = {
  success: { role: 'status', politeness: 'polite' },
  error: { role: 'alert', politeness: 'assertive' },
  warning: { role: 'status', politeness: 'polite' },
} as const satisfies Record<MessageStatus, object>;

// The shipping form-result banner, filled with its status wash. Render it only when there is a
// message: an empty one would still announce itself. No outer margin; the host's gap places it.
export function RsdStatusMessage({
  status,
  children,
}: {
  status: MessageStatus;
  children: ReactNode;
}) {
  const live = LIVE[status];
  useAnnouncement(spokenText(children), live.politeness);
  return (
    <html.p role={live.role} aria-live={live.politeness} style={[styles.message, styles[status]]}>
      {children}
    </html.p>
  );
}
