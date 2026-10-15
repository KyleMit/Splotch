import { View } from 'react-native';
import { css, html } from 'react-strict-dom';
import { HIGHLIGHTS } from '../../../../web/src/routes/privacy/contents';
import { paletteHex } from '../drawing/palette';
import type privacy from '../information/privacy.generated.json';
import { RsdList } from './RsdList';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { RsdDisclosure } from './RsdDisclosure';
import { RsdRuleLabel } from './RsdRuleLabel';
import { RsdTextLink } from './RsdTextLink';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

type Policy = typeof privacy.native;
type Block = Policy['sections'][number]['blocks'][number];
type Span = Block['spans'][number];
const POLICY_LINE_HEIGHT = 1.6;
const POLICY_FONT_PX = 16;
const POLICY_LIST_INDENT_EM = 1.2;
const POLICY_ITEM_GAP_PX = 8;
const HIGHLIGHT_INLINE_PX = 22;
const HIGHLIGHT_GAP_PX = 14;
const HIGHLIGHT_CHIP_PX = { width: 18, height: 8 };
const styles = css.create({
  section: {
    paddingBlock: dimensions.space6,
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
  },
  first: { paddingTop: 0, borderTopWidth: 0 },
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

function PolicySpans({
  spans,
  onLink,
}: {
  spans: readonly Span[];
  onLink: (href: string) => void;
}) {
  return spans.map((span, index) => {
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
  });
}

function policyRuns(blocks: readonly Block[]) {
  const runs: { list: boolean; blocks: Block[] }[] = [];
  for (const block of blocks) {
    const last = runs.at(-1);
    if (block.kind === 'item' && last?.list) last.blocks.push(block);
    else runs.push({ list: block.kind === 'item', blocks: [block] });
  }
  return runs;
}

function PolicyBlocks({
  blocks,
  onLink,
}: {
  blocks: readonly Block[];
  onLink: (href: string) => void;
}) {
  const theme = useDrawingTheme();
  const runs = policyRuns(blocks);
  return runs.map((run, index) =>
    run.list ? (
      <html.div key={index} style={[styles.paragraph, index === runs.length - 1 && styles.flush]}>
        <RsdList
          ordered={false}
          fontSizePx={POLICY_FONT_PX}
          lineHeightPx={POLICY_FONT_PX * POLICY_LINE_HEIGHT}
          indentPx={POLICY_FONT_PX * POLICY_LIST_INDENT_EM}
          gapPx={POLICY_ITEM_GAP_PX}
          markerColor={theme.text}
          items={run.blocks.map((block, at) => (
            <PolicySpans key={at} spans={block.spans} onLink={onLink} />
          ))}
        />
      </html.div>
    ) : (
      <html.p key={index} style={[styles.paragraph, index === runs.length - 1 && styles.flush]}>
        <PolicySpans spans={run.blocks[0].spans} onLink={onLink} />
      </html.p>
    )
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
      {policy.sections.map((section, index) => (
        <View
          key={section.id}
          onLayout={({ nativeEvent }) => onSectionLayout(section.id, nativeEvent.layout.y)}
        >
          <html.section style={[styles.section, index === 0 && styles.first]}>
            <html.h3 style={[controlStyles.boldText, styles.heading]}>{section.title}</html.h3>
            <PolicyBlocks blocks={section.blocks} onLink={onLink} />
          </html.section>
        </View>
      ))}
    </>
  );
}
