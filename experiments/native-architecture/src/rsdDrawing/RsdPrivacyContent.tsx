import { View } from 'react-native';
import { css, html } from 'react-strict-dom';
import { HIGHLIGHTS } from '../../../../web/src/routes/privacy/contents';
import { paletteHex } from '../drawing/palette';
import type privacy from '../information/privacy.generated.json';
import { RsdDisclosure } from './RsdDisclosure';
import { RsdRuleLabel } from './RsdRuleLabel';
import { RsdTextLink } from './RsdTextLink';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

type Policy = typeof privacy.native;
type Span = Policy['sections'][number]['blocks'][number]['spans'][number];
const POLICY_LINE_HEIGHT = 1.6;
const HIGHLIGHT_INLINE_PX = 22;
const HIGHLIGHT_GAP_PX = 14;
const HIGHLIGHT_CHIP_PX = { width: 18, height: 8 };
const styles = css.create({
  section: { marginTop: dimensions.space6 },
  heading: {
    marginTop: 0,
    marginBottom: dimensions.space2,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: dimensions.space3,
    fontSize: dimensions.fontSizeMd,
    color: colors.text,
    lineHeight: POLICY_LINE_HEIGHT,
  },
  muted: { color: colors.textSoft },
  link: { color: colors.brandText, textDecorationLine: 'underline', cursor: 'pointer' },
  italic: { fontStyle: 'italic' },
  summary: {
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: colors.brandWashHover,
    borderRadius: dimensions.radiusLg,
    paddingBlock: dimensions.space1,
    paddingInline: HIGHLIGHT_INLINE_PX,
    marginTop: dimensions.space5,
    marginBottom: dimensions.space8,
  },
  highlight: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: HIGHLIGHT_GAP_PX,
    paddingBlock: dimensions.space3,
  },
  highlightRule: {
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.brandWash,
  },
  chip: (backgroundColor: string) => ({
    flexShrink: 0,
    width: HIGHLIGHT_CHIP_PX.width,
    height: HIGHLIGHT_CHIP_PX.height,
    borderRadius: dimensions.radiusPill,
    backgroundColor,
  }),
  flush: { marginBottom: 0, flexShrink: 1 },
  disclosure: { marginTop: dimensions.space5, marginBottom: dimensions.space4 },
  disclosureSummary: { padding: dimensions.space3 },
});

function PolicyParagraph({
  spans,
  onLink,
}: {
  spans: readonly Span[];
  onLink: (href: string) => void;
}) {
  return (
    <html.p style={styles.paragraph}>
      {spans.map((span, index) => {
        const href = span.href;
        return (
          <html.span
            key={index}
            style={[
              span.strong && controlStyles.boldText,
              span.italic && styles.italic,
              href && styles.link,
            ]}
            role={href ? 'link' : undefined}
            tabIndex={href ? 0 : undefined}
            onClick={href ? () => onLink(href) : undefined}
            onKeyDown={
              href
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onLink(href);
                    }
                  }
                : undefined
            }
          >
            {span.text}
          </html.span>
        );
      })}
    </html.p>
  );
}

export function RsdPrivacyContent({
  policy,
  onLink,
  onSectionLayout,
}: {
  policy: Policy;
  onLink: (href: string) => void;
  onSectionLayout: (id: string, y: number) => void;
}) {
  return (
    <>
      <html.p style={[styles.paragraph, styles.muted]}>{policy.updated}</html.p>
      <RsdRuleLabel>The short version</RsdRuleLabel>
      <html.div style={styles.summary}>
        {HIGHLIGHTS.map(({ label, lead, body }, index) => (
          <html.div key={label} style={[styles.highlight, index > 0 && styles.highlightRule]}>
            <html.div aria-hidden style={styles.chip(paletteHex(label))} />
            <html.p style={[styles.paragraph, styles.flush]}>
              <html.strong style={controlStyles.boldText}>{lead}</html.strong>
              {` ${body}`}
            </html.p>
          </html.div>
        ))}
      </html.div>
      <RsdRuleLabel>The details</RsdRuleLabel>
      <RsdDisclosure
        summary={`${policy.sections.length} sections`}
        style={styles.disclosure}
        summaryStyle={styles.disclosureSummary}
      >
        <html.nav aria-label="Privacy policy contents">
          {policy.sections.map((section) => (
            <RsdTextLink
              key={section.id}
              onPress={() => onLink(`#${section.id}`)}
              style={styles.paragraph}
            >
              {section.title}
            </RsdTextLink>
          ))}
        </html.nav>
      </RsdDisclosure>
      {policy.sections.map((section) => (
        <View
          key={section.id}
          onLayout={({ nativeEvent }) => onSectionLayout(section.id, nativeEvent.layout.y)}
        >
          <html.section style={styles.section}>
            <html.h3 style={[controlStyles.boldText, styles.heading]}>{section.title}</html.h3>
            {section.blocks.map((block, index) => (
              <PolicyParagraph key={index} spans={block.spans} onLink={onLink} />
            ))}
          </html.section>
        </View>
      ))}
    </>
  );
}
