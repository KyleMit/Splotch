import { useState, type ComponentProps, type ReactElement } from 'react';
import { css, html } from 'react-strict-dom';
import { colors, dimensions, motion } from './tokens.css';
import { useReduceMotion } from '../drawing/useReduceMotion';

// Disclosure.svelte turns its › a quarter turn to point at the open panel.
// Exported for native-design-primitives-drift.test.mjs, which reads it from shipping.
export const DISCLOSURE_OPEN_TURN = 'rotate(90deg)';

type BoxStyle = ComponentProps<typeof html.div>['style'];
type MarkStyle = ComponentProps<typeof html.span>['style'];

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
// and `style`, sizes the › through `markStyle`, and passes the body in. React Native draws text
// only inside a Text, and the button wraps its children in one only when they are a single string,
// so a string summary gets a span of its own, a composed summary brings its own spans, and the
// body is an element rather than bare text.
export function RsdDisclosure({
  summary,
  children,
  style,
  summaryStyle,
  markStyle,
}: {
  summary: string | ReactElement;
  children: ReactElement;
  style?: BoxStyle;
  summaryStyle?: BoxStyle;
  markStyle?: MarkStyle;
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
        {typeof summary === 'string' ? <html.span>{summary}</html.span> : summary}
        <html.div
          aria-hidden
          style={[styles.chevron, reduceMotion && styles.still, open && styles.open]}
        >
          <html.span style={[styles.mark, markStyle]}>›</html.span>
        </html.div>
      </html.button>
      {open ? children : null}
    </html.div>
  );
}
