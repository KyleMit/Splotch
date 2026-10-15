import { View, useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import releases from '../../../../web/src/lib/releases.json';
import { parseReleaseHue } from '../../../../web/src/lib/releaseHues';
import { RELEASES_SHOWN_OPEN } from '../../../../web/src/lib/releaseHistoryPolicy';
import { RELEASE_NOTES } from '../settings/whatsNew';
import { INFORMATION_TOP_ID } from '../information/appPages';
import { PRIVACY_LAYOUT } from '../information/privacyLayout';
import { RsdPageContents } from './RsdPageContents';
import { RsdReleaseArticle, RsdReleaseRule } from './RsdReleaseArticle';
import { RsdSidebarRow } from './RsdSidebarRow';
import { RsdRuleLabel } from './RsdRuleLabel';
import { RsdPressable } from './RsdPressable';
import { RsdIcon } from './RsdIcon';
import { Svg, Path } from '../platform/svg';
import { blobPath } from './blob';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_ON_BRAND } from '../drawing/theme';
import { styles as controls } from './controls';
import { useReleaseHistory } from './useReleaseHistory';
import { RsdTextLink } from './RsdTextLink';
import { PAGE_FRAMED_MAX_WIDTH_PX } from './RsdNotFoundPage';
import { colors, dimensions } from './tokens.css';

const RELEASE_SPY_BAND_BOTTOM_PERCENT = 70;
const PERCENT = 100;
const FOOTER_RESERVE_PX = 160;
const END_TOP_PX = 24;
const OLDER_TOP_PX = 18;
const OLDER_PADDING_PX = { block: 10, inline: 18 };
const NAV_TARGET_PX = 44;
const NAV_GAP_PX = 10;
const NAV_MARKS = {
  older: { size: 22, icon: 16, turn: '-90deg' },
  top: { size: 40, icon: 22, turn: '90deg' },
} as const;
const styles = css.create({
  article: {
    position: 'relative',
    paddingTop: dimensions.space8,
    paddingBottom: dimensions.space8,
  },
  first: { paddingTop: 0 },
  rule: { position: 'absolute', top: 0, left: 0, right: 0 },
  railLabel: { paddingBottom: dimensions.space4 },
  older: { position: 'relative', paddingTop: OLDER_TOP_PX, alignItems: 'center' },
  end: { position: 'relative', paddingTop: END_TOP_PX, alignItems: 'center' },
  endText: { color: colors.textSoft, fontSize: dimensions.fontSizeSm, lineHeight: 1.62 },
  top: {
    color: colors.brandText,
    fontSize: dimensions.fontSizeMd,
    minHeight: NAV_TARGET_PX,
    alignItems: 'center',
    gap: NAV_GAP_PX,
  },
  olderButton: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space2,
    minHeight: NAV_TARGET_PX,
    paddingBlock: OLDER_PADDING_PX.block,
    paddingInline: OLDER_PADDING_PX.inline,
    borderWidth: 0,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.brandWash,
    color: colors.brandText,
    fontSize: dimensions.fontSizeSm,
    cursor: 'pointer',
  },
  version: { margin: 0, fontSize: dimensions.fontSizeXs, color: colors.textSoft },
});
const CONTENTS = releases.map((release) => ({
  ...release,
  label: `Version ${release.version}`,
  hue: parseReleaseHue(release.hue),
}));
type HistoryProps = {
  scrollY: number;
  onSectionLayout: (id: string, y: number) => void;
  onLink: (href: string) => void;
};

export function RsdReleaseHistory({ scrollY, onSectionLayout, onLink }: HistoryProps) {
  const window = useWindowDimensions();
  const wide = window.width > PAGE_FRAMED_MAX_WIDTH_PX;
  const navigation = useReleaseHistory(CONTENTS, onSectionLayout, onLink);
  const { geometry, positions, olderOpen, contentsOpen } = navigation;
  const line = scrollY + window.height * ((PERCENT - RELEASE_SPY_BAND_BOTTOM_PERCENT) / PERCENT);
  const active =
    CONTENTS.findLast(({ id }) => (positions[id] ?? Infinity) + geometry.columnTop <= line)?.id ??
    CONTENTS[0].id;
  const entered =
    positions[CONTENTS[0].id] !== undefined &&
    geometry.columnTop + positions[CONTENTS[0].id] <= line;
  const visible = olderOpen ? RELEASE_NOTES : RELEASE_NOTES.slice(0, RELEASES_SHOWN_OPEN);
  const railOffset = Math.max(
    0,
    Math.min(
      scrollY + PRIVACY_LAYOUT.stickyTop - geometry.top,
      geometry.height - geometry.railHeight
    )
  );
  return (
    <View testID="changelog-history" onLayout={navigation.rootLayout}>
      {!wide ? (
        <RsdPageContents
          items={CONTENTS}
          label="Changelog contents"
          noun="releases"
          active={active}
          entered={entered}
          open={contentsOpen}
          offset={Math.max(
            0,
            Math.min(scrollY - geometry.contentsTop, geometry.height - geometry.contentsHeight)
          )}
          onToggle={navigation.toggleContents}
          onSelect={navigation.pick}
          onLayout={navigation.contentsLayout}
        />
      ) : null}
      <View
        testID="changelog-body"
        onLayout={navigation.bodyLayout}
        style={{ flexDirection: wide ? 'row' : 'column', gap: PRIVACY_LAYOUT.railGap }}
      >
        {wide ? (
          <View
            testID="changelog-contents-rail"
            style={{
              width: PRIVACY_LAYOUT.railWidth,
              alignSelf: 'flex-start',
              transform: [{ translateY: railOffset }],
            }}
            onLayout={navigation.railLayout}
          >
            <html.div style={styles.railLabel}>
              <RsdRuleLabel>Contents</RsdRuleLabel>
            </html.div>
            <html.nav aria-label="Changelog contents">
              {CONTENTS.map((release) => (
                <RsdSidebarRow
                  key={release.id}
                  label={release.label}
                  meta={release.dateLabel}
                  hue={release.hue}
                  active={active === release.id}
                  onSelect={() => navigation.pick(release.id)}
                />
              ))}
            </html.nav>
          </View>
        ) : null}
        <View
          testID="changelog-reading-column"
          style={{ flex: wide ? 1 : undefined, minWidth: 0 }}
          onLayout={navigation.columnLayout}
        >
          {visible.map((release, index) => {
            const meta = CONTENTS[index];
            return (
              <View
                key={release.version}
                testID={`changelog-position-${meta.id}`}
                style={{ position: 'relative' }}
                onLayout={(event) => navigation.articleLayout(meta.id, event)}
              >
                <html.div style={[styles.article, index === 0 && styles.first]}>
                  {index > 0 ? (
                    <html.div style={styles.rule}>
                      <RsdReleaseRule hue={meta.hue} />
                    </html.div>
                  ) : null}
                  <RsdReleaseArticle
                    release={release}
                    datetime={meta.datetime}
                    hue={meta.hue}
                    latest={index === 0}
                  />
                </html.div>
              </View>
            );
          })}
          {!olderOpen && RELEASE_NOTES.length > RELEASES_SHOWN_OPEN ? (
            <html.div style={styles.older}>
              <html.div style={styles.rule}>
                <RsdReleaseRule />
              </html.div>
              <RsdPressable style={styles.olderButton} onClick={navigation.showOlder}>
                <ReleaseNavMark kind="older" />
                <html.span
                  style={controls.semiboldText}
                >{`Show ${RELEASE_NOTES.length - RELEASES_SHOWN_OPEN} older releases`}</html.span>
              </RsdPressable>
            </html.div>
          ) : null}
          <ReleaseHistoryEnd height={window.height} onLink={onLink} />
        </View>
      </View>
    </View>
  );
}

export function RsdLatestReleaseLabel() {
  const latest = RELEASE_NOTES[0];
  return (
    <html.p
      style={styles.version}
    >{`Splotch ${latest.version} · released ${latest.dateLabel}`}</html.p>
  );
}

function ReleaseHistoryEnd({ height, onLink }: { height: number; onLink: (href: string) => void }) {
  const oldest = CONTENTS.at(-1);
  return (
    <View
      style={{
        minHeight: Math.max(
          0,
          (height * RELEASE_SPY_BAND_BOTTOM_PERCENT) / PERCENT - FOOTER_RESERVE_PX
        ),
      }}
    >
      <html.footer style={styles.end}>
        <html.div style={styles.rule}>
          <RsdReleaseRule />
        </html.div>
        <html.p style={styles.endText}>{`That's every release since ${oldest?.dateLabel}.`}</html.p>
        <RsdTextLink style={styles.top} onPress={() => onLink(`#${INFORMATION_TOP_ID}`)}>
          <ReleaseNavMark kind="top" />
          <html.span style={controls.boldText}>Back to top</html.span>
        </RsdTextLink>
      </html.footer>
    </View>
  );
}

function ReleaseNavMark({ kind }: { kind: keyof typeof NAV_MARKS }) {
  const theme = useDrawingTheme();
  const { size, icon, turn } = NAV_MARKS[kind];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
        <Svg width={size} height={size}>
          <Path d={blobPath('radiusBlob1', size, size)} fill={theme.brandSolid} />
        </Svg>
      </View>
      <View style={{ transform: [{ rotate: turn }] }}>
        <RsdIcon name="chevron-left" size={icon} ink={DRAWING_ON_BRAND} muted={false} />
      </View>
    </View>
  );
}
