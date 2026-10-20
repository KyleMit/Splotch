import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { Svg, Path } from '../platform/svg';
import { blobPath } from './blob';
import { css, html } from 'react-strict-dom';
import {
  HIGHLIGHTS,
  SECTIONS,
  SPY_LINE_PX,
  type SectionId,
} from '../../../../web/src/routes/privacy/contents';
import { paletteHex } from '../drawing/palette';
import type privacy from '../information/privacy.generated.json';
import { RsdList } from './RsdList';
import { RsdSidebarRow } from './RsdSidebarRow';
import { RsdPageAnchor } from './RsdPageAnchor';
import { RsdPrivacyHeading } from './RsdPrivacyHeading';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { usePrivacySectionLinks } from './usePrivacySectionLinks';
import { PAGE_FRAMED_MAX_WIDTH_PX } from './RsdNotFoundPage';
import { PRIVACY_LAYOUT } from '../information/privacyLayout';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE } from '../drawing/theme';
import { PAGE_CONTENTS, RsdPageContents } from './RsdPageContents';
import { useInformationViewport } from './useInformationViewport';
import { RsdRuleLabel } from './RsdRuleLabel';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

type Policy = typeof privacy.native;
type Block = Policy['sections'][number]['blocks'][number];
type Span = { text: string; href?: string; strong?: boolean; italic?: boolean };
const UPDATED_MARK_PX = 10;
const UPDATED_TOP_PULL_PX = 16;
const UPDATED_LINE_HEIGHT = 1.62;
const UPDATED_MARK_PATH = blobPath('radiusBlob1', UPDATED_MARK_PX, UPDATED_MARK_PX);
const POLICY_LINE_HEIGHT = 1.62;
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
  paragraph: {
    marginTop: 0,
    marginBottom: dimensions.space3,
    fontSize: dimensions.fontSizeMd,
    color: colors.text,
    lineHeight: POLICY_LINE_HEIGHT,
  },
  updated: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: UPDATED_MARK_PX,
    marginTop: -UPDATED_TOP_PULL_PX,
    marginBottom: dimensions.space6,
  },
  updatedText: {
    margin: 0,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    lineHeight: UPDATED_LINE_HEIGHT,
  },
  updatedDot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: UPDATED_MARK_PX,
    height: UPDATED_MARK_PX,
  },
  pageRule: { paddingBottom: dimensions.space5 },
  link: { color: colors.brandText, textDecorationLine: 'underline', cursor: 'pointer' },
  italic: { fontStyle: 'italic' },
  summary: {
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: colors.brandWashHover,
    borderRadius: dimensions.radiusLg,
    paddingBlock: dimensions.space1,
    paddingInline: HIGHLIGHT_INLINE_PX,
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
});

// The native Text renderer drops keyboard props; this export exposes the web link's rendered handler.
export function PolicySpans({
  spans,
  onLink,
}: {
  spans: readonly Span[];
  onLink: (href: string) => void;
}) {
  return spans.map((span, index) => {
    const href = span.href;
    const style = [
      span.strong && controlStyles.boldText,
      span.italic && styles.italic,
      !!href && styles.link,
    ];
    // A section of this page or another app page is a real anchor on the web, as shipping's is; a
    // link that leaves the app keeps its grown-up check, which an address would let a click skip.
    if (href && /^[#/]/.test(href) && Platform.OS === 'web')
      return (
        <RsdPageAnchor key={index} href={href} onFollow={() => onLink(href)} style={style}>
          {span.text}
        </RsdPageAnchor>
      );
    return (
      <html.span
        key={index}
        style={style}
        role={href ? 'link' : undefined}
        tabIndex={href ? 0 : undefined}
        onClick={href ? () => onLink(href) : undefined}
        onKeyDown={
          href
            ? (event) => {
                if (event.key === 'Enter') {
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

type PrivacyContentProps = {
  policy: Policy;
  onLink: (href: string) => void;
  onSectionLayout: (id: string, y: number) => void;
  scrollY: number;
};

function reportPrivacySectionPositions(
  y: number,
  top: { current: number },
  positions: Record<string, number>,
  report: PrivacyContentProps['onSectionLayout']
) {
  top.current = y;
  for (const [id, offset] of Object.entries(positions)) report(id, y + offset);
}

function PrivacyReadingColumn({
  policy,
  onLink,
  onSectionLayout,
  wide,
  links,
}: Omit<PrivacyContentProps, 'scrollY'> & {
  wide: boolean;
  links: ReturnType<typeof usePrivacySectionLinks>;
}) {
  const { height } = useInformationViewport();
  const lastSectionMinHeight = Math.max(
    0,
    height - SPY_LINE_PX - DRAWING_SCALE.space4 - PRIVACY_LAYOUT.footerReserve
  );
  return (
    <View testID="privacy-reading-column" style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
      {policy.sections.map((section, index) => (
        <View
          key={section.id}
          testID={`privacy-section-${section.id}`}
          style={
            index === policy.sections.length - 1 ? { minHeight: lastSectionMinHeight } : undefined
          }
          onLayout={({ nativeEvent }) => onSectionLayout(section.id, nativeEvent.layout.y)}
        >
          <html.section style={[styles.section, index === 0 && styles.first]}>
            <RsdPrivacyHeading
              section={SECTIONS[index]}
              copied={links.copied === section.id}
              wide={wide}
              onCopy={() => void links.copy(SECTIONS[index].id)}
            />
            <PolicyBlocks blocks={section.blocks} onLink={onLink} />
          </html.section>
        </View>
      ))}
    </View>
  );
}

function PrivacyDetails({ policy, onLink, onSectionLayout, scrollY }: PrivacyContentProps) {
  const wide = useWindowDimensions().width > PAGE_FRAMED_MAX_WIDTH_PX;
  const viewport = useInformationViewport();
  const links = usePrivacySectionLinks(onLink);
  const [geometry, setGeometry] = useState({
    top: 0,
    height: 0,
    railHeight: 0,
    contentsTop: 0,
    contentsHeight: 0,
    measured: false,
  });
  const [contentsOpen, setContentsOpen] = useState(false);
  const pendingJump = useRef<SectionId | null>(null);
  const positions = useRef<Record<string, number>>({});
  const top = useRef(0);
  const active =
    SECTIONS.findLast(
      ({ id }) =>
        (positions.current[id] ?? Infinity) + geometry.top <= scrollY + viewport.top + SPY_LINE_PX
    )?.id ?? SECTIONS[0].id;
  const railOffset = Math.max(
    0,
    Math.min(
      scrollY + viewport.top + PRIVACY_LAYOUT.stickyTop - geometry.top,
      geometry.height - geometry.railHeight
    )
  );
  return (
    <>
      {!wide ? (
        <RsdPageContents
          items={SECTIONS}
          label="Privacy policy contents"
          noun="sections"
          active={active}
          entered={geometry.measured && scrollY + viewport.top + SPY_LINE_PX >= geometry.top}
          open={contentsOpen}
          offset={Math.max(
            0,
            Math.min(
              scrollY + viewport.top - geometry.contentsTop,
              geometry.top + geometry.height - geometry.contentsTop - geometry.contentsHeight
            )
          )}
          onToggle={() => setContentsOpen((value) => !value)}
          onSelect={(id) => {
            pendingJump.current = id;
            setContentsOpen(false);
          }}
          onLayout={({ nativeEvent }) => {
            const { y, height } = nativeEvent.layout;
            const detailsTop = y + height + PAGE_CONTENTS.inset;
            reportPrivacySectionPositions(detailsTop, top, positions.current, onSectionLayout);
            setGeometry((old) => ({
              ...old,
              top: detailsTop,
              contentsTop: y,
              contentsHeight: height,
            }));
            if (!contentsOpen && pendingJump.current) {
              onLink(`#${pendingJump.current}`);
              pendingJump.current = null;
            }
          }}
        />
      ) : null}
      <RsdVisuallyHidden live>{links.announcement}</RsdVisuallyHidden>
      <View
        testID="privacy-details"
        style={{ flexDirection: wide ? 'row' : 'column', gap: PRIVACY_LAYOUT.railGap }}
        onLayout={({ nativeEvent }) => {
          const { y, height } = nativeEvent.layout;
          reportPrivacySectionPositions(y, top, positions.current, onSectionLayout);
          setGeometry((old) => ({ ...old, top: y, height, measured: true }));
        }}
      >
        {wide ? (
          <View
            testID="privacy-contents-rail"
            style={{
              width: PRIVACY_LAYOUT.railWidth,
              transform: [{ translateY: railOffset }],
              alignSelf: 'flex-start',
            }}
            onLayout={({ nativeEvent }) =>
              setGeometry((old) => ({ ...old, railHeight: nativeEvent.layout.height }))
            }
          >
            <html.nav aria-label="Privacy policy contents">
              {SECTIONS.map((section) => (
                <RsdSidebarRow
                  key={section.id}
                  label={section.label}
                  active={active === section.id}
                  href={`#${section.id}`}
                  onSelect={() => onLink(`#${section.id}`)}
                />
              ))}
            </html.nav>
          </View>
        ) : null}
        <PrivacyReadingColumn
          policy={policy}
          onLink={onLink}
          wide={wide}
          links={links}
          onSectionLayout={(id, y) => {
            positions.current[id] = y;
            onSectionLayout(id, top.current + y);
          }}
        />
      </View>
    </>
  );
}

export function RsdPrivacyContent(props: PrivacyContentProps) {
  const { policy } = props;
  return (
    <>
      <html.div data-testid="privacy-updated" style={styles.updated}>
        <html.div aria-hidden data-testid="privacy-updated-dot" style={styles.updatedDot}>
          <Svg width={UPDATED_MARK_PX} height={UPDATED_MARK_PX}>
            <Path d={UPDATED_MARK_PATH} fill={paletteHex('Purple')} />
          </Svg>
        </html.div>
        <html.p style={[controlStyles.semiboldText, styles.updatedText]}>{policy.updated}</html.p>
      </html.div>
      <html.div data-testid="privacy-short-version-label" style={styles.pageRule}>
        <RsdRuleLabel>The short version</RsdRuleLabel>
      </html.div>
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
      <html.div data-testid="privacy-details-label" style={styles.pageRule}>
        <RsdRuleLabel>The details</RsdRuleLabel>
      </html.div>
      <PrivacyDetails {...props} />
    </>
  );
}
