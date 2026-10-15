import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { formatReleaseAgo } from '../../../../web/src/lib/releaseAgo';
import { paletteHex, type PaletteLabel } from '../drawing/palette';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import type { ReleaseNotes } from '../settings/whatsNew';
import { Svg, Path } from '../platform/svg';
import { blobPath } from './blob';
import { mixSrgb } from './colorMix';
import { releaseBlockRuns } from './RsdWhatsNewSection';
import { styles as controls } from './controls';
import { colors, dimensions, fonts } from './tokens.css';

export const RELEASE_PAGE = {
  lineHeight: 1.62,
  font: 16,
  marker: 10,
  indent: 20,
  itemGap: 8,
  narrowHeader: 420,
} as const;
const LINE_HEIGHT = RELEASE_PAGE.lineHeight;
const FONT_PX = RELEASE_PAGE.font;
const MARKER_PX = RELEASE_PAGE.marker;
const INDENT_PX = RELEASE_PAGE.indent;
const ITEM_GAP_PX = RELEASE_PAGE.itemGap;
const TAPE_PADDING_PX = { block: 3, inline: 14 };
const LATEST_PADDING_PX = 2;
const AGO_GAP_PX = 2;
const RULE_PERIOD_PX = 24;
const RULE_HEIGHT_PX = 8;
const RULE_STROKE_PX = 2.5;
const LATEST_TILT = '3deg';
const TAPE_EDGE_FRACTIONS = { left: 0.03, top: 0.08, right: 0.97, bottom: 0.9 };
const SECTION_TAPES = {
  New: { hue: 'Green', angle: '-1.5deg' },
  Improved: { hue: 'Blue', angle: '1deg' },
  Fixed: { hue: 'Orange', angle: '-1deg' },
} as const satisfies Record<string, { hue: PaletteLabel; angle: string }>;
const MARKER_SHAPES = ['radiusBlob1', 'radiusBlob2', 'radiusBlob3'] as const;
const styles = css.create({
  header: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: dimensions.space3,
    marginBottom: dimensions.space4,
  },
  narrow: { flexDirection: 'column', alignItems: 'flex-start', gap: dimensions.space1 },
  title: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: dimensions.space3,
  },
  heading: {
    margin: 0,
    fontSize: dimensions.fontSizeXl,
    color: colors.textStrong,
    lineHeight: 1.25,
  },
  date: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: AGO_GAP_PX,
    flexShrink: 0,
  },
  narrowDate: { alignItems: 'flex-start' },
  dateText: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: LINE_HEIGHT,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  ago: {
    color: colors.brandText,
    fontSize: dimensions.fontSizeXs,
    lineHeight: LINE_HEIGHT,
    minHeight: '1.62em',
  },
  tapeText: {
    margin: 0,
    paddingBlock: TAPE_PADDING_PX.block,
    paddingInline: TAPE_PADDING_PX.inline,
    fontSize: FONT_PX,
    lineHeight: LINE_HEIGHT,
  },
  latestText: {
    paddingBlock: LATEST_PADDING_PX,
    paddingInline: dimensions.space3,
    fontSize: dimensions.fontSizeXs,
  },
  ink: (color: string) => ({ color }),
  section: { display: 'flex', flexDirection: 'column', marginTop: dimensions.space4 },
  firstSection: { marginTop: 0 },
  notes: { fontSize: FONT_PX, lineHeight: LINE_HEIGHT, color: colors.text },
  list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' },
  item: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', marginTop: ITEM_GAP_PX },
  first: { marginTop: 0 },
  marker: {
    width: INDENT_PX,
    height: FONT_PX * LINE_HEIGHT,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemText: { flexShrink: 1, minWidth: 0, flexGrow: 1 },
  paragraph: { margin: 0, marginBottom: dimensions.space3 },
});

function tapeFor(title: string) {
  return Object.entries(SECTION_TAPES).find(([name]) => name === title)?.[1];
}

function ReleaseTape({ title, latest = false }: { title: string; latest?: boolean }) {
  const theme = useDrawingTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const tape = tapeFor(title);
  const fill = mixSrgb(
    paletteHex(latest ? 'Pink' : (tape?.hue ?? 'Purple')),
    Number.parseFloat(theme.tapeStrength),
    theme.surface
  );
  const path = `M${size.width * TAPE_EDGE_FRACTIONS.left} 0 L${size.width} ${size.height * TAPE_EDGE_FRACTIONS.top} L${size.width * TAPE_EDGE_FRACTIONS.right} ${size.height} L0 ${size.height * TAPE_EDGE_FRACTIONS.bottom} Z`;
  return (
    <View
      testID={`release-tape-${title}`}
      onLayout={({ nativeEvent }) => setSize(nativeEvent.layout)}
      style={{
        alignSelf: 'flex-start',
        transform: [{ rotate: latest ? LATEST_TILT : (tape?.angle ?? '0deg') }],
        marginBottom: latest ? 0 : ITEM_GAP_PX,
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
        <Svg width={size.width} height={size.height}>
          <Path d={path} fill={fill} />
        </Svg>
      </View>
      {latest ? (
        <html.span
          style={[controls.boldText, styles.tapeText, styles.latestText, styles.ink(theme.tapeInk)]}
        >
          {title}
        </html.span>
      ) : (
        <html.h3 style={[controls.boldText, styles.tapeText, styles.ink(theme.tapeInk)]}>
          {title}
        </html.h3>
      )}
    </View>
  );
}

function ReleaseBlocks({
  section,
  releaseHue,
}: {
  section: ReleaseNotes['sections'][number];
  releaseHue: PaletteLabel;
}) {
  const hue = tapeFor(section.title)?.hue ?? releaseHue;
  return releaseBlockRuns(section.blocks).map((run, index) =>
    run.kind === 'item' ? (
      <html.ul key={index} role="list" style={styles.list}>
        {run.texts.map((text, item) => (
          <html.li key={text} style={[styles.item, item === 0 && styles.first]}>
            <html.div aria-hidden style={styles.marker}>
              <Svg width={MARKER_PX} height={MARKER_PX}>
                <Path
                  d={blobPath(MARKER_SHAPES[item % MARKER_SHAPES.length], MARKER_PX, MARKER_PX)}
                  fill={paletteHex(hue)}
                />
              </Svg>
            </html.div>
            <html.span style={styles.itemText}>{text}</html.span>
          </html.li>
        ))}
      </html.ul>
    ) : (
      <html.p key={index} style={styles.paragraph}>
        {run.texts[0]}
      </html.p>
    )
  );
}

export function RsdReleaseArticle({
  release,
  datetime,
  hue,
  latest,
}: {
  release: ReleaseNotes;
  datetime: string;
  hue: PaletteLabel;
  latest: boolean;
}) {
  const narrow = useWindowDimensions().width <= RELEASE_PAGE.narrowHeader;
  return (
    <View testID={`changelog-${release.version}`}>
      <html.header style={[styles.header, narrow && styles.narrow]}>
        <html.div style={styles.title}>
          <html.h2
            style={[controls.boldText, styles.heading]}
          >{`Version ${release.version}`}</html.h2>
          {latest ? <ReleaseTape title="Latest" latest /> : null}
        </html.div>
        <html.div style={[styles.date, narrow && styles.narrowDate]}>
          <html.span style={styles.dateText}>{release.dateLabel}</html.span>
          <html.span aria-hidden style={[controls.boldText, styles.ago]}>
            {formatReleaseAgo(datetime, new Date())}
          </html.span>
        </html.div>
      </html.header>
      <html.div style={styles.notes}>
        {release.sections.map((section, index) => (
          <html.div
            key={section.title}
            data-testid={`release-section-${section.title}`}
            style={[styles.section, index === 0 && styles.firstSection]}
          >
            <ReleaseTape title={section.title} />
            <ReleaseBlocks section={section} releaseHue={hue} />
          </html.div>
        ))}
      </html.div>
    </View>
  );
}

export function RsdReleaseRule({ hue }: { hue?: PaletteLabel }) {
  const theme = useDrawingTheme();
  const [width, setWidth] = useState(0);
  const path = Array.from({ length: Math.ceil(width / RULE_PERIOD_PX) }, (_, index) => {
    const x = index * RULE_PERIOD_PX;
    return `M${x} ${RULE_HEIGHT_PX / 2} Q${x + RULE_PERIOD_PX / 4} 0 ${x + RULE_PERIOD_PX / 2} ${RULE_HEIGHT_PX / 2} T${x + RULE_PERIOD_PX} ${RULE_HEIGHT_PX / 2}`;
  }).join(' ');
  const ink = mixSrgb(
    hue ? paletteHex(hue) : theme.border,
    Number.parseFloat(theme.squiggleStrength),
    theme.surface
  );
  return (
    <View
      testID="release-squiggle"
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      style={{ height: RULE_HEIGHT_PX }}
    >
      <Svg width={width} height={RULE_HEIGHT_PX}>
        <Path
          d={path}
          fill="none"
          stroke={ink}
          strokeWidth={RULE_STROKE_PX}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
