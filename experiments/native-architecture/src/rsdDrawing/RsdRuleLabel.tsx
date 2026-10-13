import { css, html } from 'react-strict-dom';
import { colors, dimensions, fonts } from './tokens.css';

// The shipping RuleLabel.svelte tracking and leading; rsd-native-settings-rows.test.mjs reads
// each from that source.
const TRACKING = '0.14em';
const STRONG_TRACKING = '0.1em';
const LINE_HEIGHT = 1.2;

const HEADINGS = { h2: html.h2, h3: html.h3, h4: html.h4 } as const;
type RuleLabelLevel = keyof typeof HEADINGS;

const styles = css.create({
  rule: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
  },
  heading: {
    margin: 0,
    flexShrink: 1,
    color: colors.labelInk,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    letterSpacing: TRACKING,
    textTransform: 'uppercase',
    lineHeight: LINE_HEIGHT,
  },
  // The heavier tier for section heads inside Settings, where the extra weight holds a heading
  // against the controls under it.
  strong: {
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    letterSpacing: STRONG_TRACKING,
  },
  hairline: {
    flexGrow: 1,
    height: dimensions.borderWidth,
    backgroundColor: colors.border,
  },
});

// The shipping RuleLabel.svelte: an uppercase heading with a trailing hairline rule.
export function RsdRuleLabel({
  children,
  as = 'h2',
  strong = false,
}: {
  children: string;
  as?: RuleLabelLevel;
  strong?: boolean;
}) {
  const Heading = HEADINGS[as];
  return (
    <html.div style={styles.rule}>
      <Heading data-testid="rule-label-heading" style={[styles.heading, strong && styles.strong]}>
        {children}
      </Heading>
      <html.div aria-hidden data-testid="rule-label-hairline" style={styles.hairline} />
    </html.div>
  );
}
