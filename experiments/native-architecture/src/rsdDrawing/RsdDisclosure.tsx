import { useState, type ComponentProps, type ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { colors, dimensions, motion } from './tokens.css';
import { useReduceMotion } from '../drawing/useReduceMotion';

// Disclosure.svelte turns its › a quarter turn to point at the open panel.
// Exported for native-design-primitives-drift.test.mjs, which reads it from shipping.
export const DISCLOSURE_OPEN_TURN = 'rotate(90deg)';

type BoxStyle = ComponentProps<typeof html.div>['style'];

const styles = css.create({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: dimensions.radiusSm,
    overflow: 'hidden',
  },
  // The summary row is a button for its role and press, wearing none of a button's own chrome.
  summary: {
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: dimensions.radiusSm,
    cursor: 'pointer',
    userSelect: 'none',
  },
  chevron: {
    transitionProperty: 'transform',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  still: { transitionDuration: '0s' },
  open: { transform: DISCLOSURE_OPEN_TURN },
  mark: { color: colors.textSoft },
});

// The shipping disclosure: a bordered panel whose summary row toggles it and announces whether it
// is expanded, with a › that turns to point open. Like the shipping primitive, it owns only the
// shell and the chevron; the caller styles the summary row and the panel through `summaryStyle`
// and `style`, and the body it passes in.
export function RsdDisclosure({
  summary,
  children,
  style,
  summaryStyle,
}: {
  summary: ReactNode;
  children: ReactNode;
  style?: BoxStyle;
  summaryStyle?: BoxStyle;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReduceMotion();
  return (
    <html.div style={[styles.panel, style]}>
      <html.button
        aria-expanded={open}
        style={[styles.summary, summaryStyle]}
        onClick={() => setOpen((current) => !current)}
      >
        {summary}
        <html.div
          aria-hidden
          style={[styles.chevron, reduceMotion && styles.still, open && styles.open]}
        >
          <html.span style={styles.mark}>›</html.span>
        </html.div>
      </html.button>
      {open ? children : null}
    </html.div>
  );
}
