import { Platform } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { paletteHex } from '../drawing/palette';
import { FEEDBACK_URL } from '../../../../web/src/lib/siteUrl';
import { APP_PAGE_PATHS, type AppPage } from '../information/appPages';
import { openAppPage } from '../platform/appPath';
import { Svg, Path } from '../platform/svg';
import { blobPath } from './blob';
import { RsdLatestReleaseLabel } from './RsdReleaseHistory';
import { RsdReleaseRule } from './RsdReleaseArticle';
import { RsdTextLink } from './RsdTextLink';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdExternalMark } from './RsdExternalMark';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

const FOOTER_MARK_PX = 24;
const FOOTER_MIN_TARGET_PX = 44;
const FOOTER_NARROW_WIDTH_PX = 540;
const FOOTER_SHORT_HEIGHT_PX = 500;
const FOOTER_NAV_GAP_PX = 18;
const FOOTER_CURRENT_GAP_PX = 6;
const FOOTER_CURRENT_DOT_PX = 10;
const FOOTER_WORDMARK_TRACKING_EM = 0.14;
const styles = css.create({
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space4,
    marginTop: dimensions.space8,
  },
  short: { marginTop: dimensions.space6 },
  row: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: dimensions.space4,
  },
  narrow: { flexDirection: 'column', alignItems: 'flex-start' },
  brand: {
    gap: dimensions.space2,
    minHeight: FOOTER_MIN_TARGET_PX,
    fontSize: dimensions.fontSizeXs,
    color: colors.text,
  },
  wordmark: {
    fontSize: dimensions.fontSizeXs,
    letterSpacing: `${FOOTER_WORDMARK_TRACKING_EM}em`,
    textTransform: 'uppercase',
  },
  nav: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    rowGap: dimensions.space1,
    columnGap: FOOTER_NAV_GAP_PX,
  },
  narrowNav: { columnGap: dimensions.space2 },
  link: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FOOTER_MIN_TARGET_PX,
    fontSize: dimensions.fontSizeSm,
    color: colors.brandText,
    textDecorationLine: 'underline',
  },
  current: {
    gap: FOOTER_CURRENT_GAP_PX,
    color: colors.textStrong,
    textDecorationLine: 'none',
  },
  dot: {
    display: 'flex',
    flexShrink: 0,
    width: FOOTER_CURRENT_DOT_PX,
    height: FOOTER_CURRENT_DOT_PX,
  },
});
const LINKS = [
  { page: 'privacy', label: 'Privacy', hue: 'Purple' },
  { page: 'changelog', label: 'Changelog', hue: 'Blue' },
  { page: 'feedback', label: 'Send feedback', hue: 'Green' },
] as const;

export function RsdInformationFooter({
  page,
  onExternal,
  onDrawingReturn,
}: {
  page: Exclude<AppPage, 'drawing'> | null;
  onExternal: (href: string) => void;
  onDrawingReturn?: () => void;
}) {
  const theme = useDrawingTheme();
  const window = useWindowDimensions();
  const narrow = window.width <= FOOTER_NARROW_WIDTH_PX;
  return (
    <html.footer style={[styles.footer, window.height <= FOOTER_SHORT_HEIGHT_PX && styles.short]}>
      <html.div aria-hidden>
        <RsdReleaseRule hue="Orange" />
      </html.div>
      <html.div style={[styles.row, narrow && styles.narrow]}>
        <RsdTextLink
          href={APP_PAGE_PATHS.drawing}
          onPress={onDrawingReturn ?? (() => openAppPage('drawing'))}
          style={styles.brand}
        >
          <html.div aria-hidden>
            <RsdSplotchyIcon size={FOOTER_MARK_PX} />
          </html.div>
          <html.span style={[controlStyles.boldText, styles.wordmark]}>Splotch</html.span>
        </RsdTextLink>
        <html.nav aria-label="Splotch pages">
          <html.ul role="list" style={[styles.nav, narrow && styles.narrowNav]}>
            {LINKS.map((link) => {
              const external = link.page === 'feedback' && Platform.OS !== 'web';
              return (
                <html.li key={link.page}>
                  {link.page === page && !external ? (
                    <html.div aria-current="page" style={[styles.link, styles.current]}>
                      <html.div aria-hidden style={styles.dot}>
                        <Svg width={FOOTER_CURRENT_DOT_PX} height={FOOTER_CURRENT_DOT_PX}>
                          <Path
                            d={blobPath(
                              'radiusBlob1',
                              FOOTER_CURRENT_DOT_PX,
                              FOOTER_CURRENT_DOT_PX
                            )}
                            fill={paletteHex(link.hue)}
                          />
                        </Svg>
                      </html.div>
                      <html.span style={controlStyles.boldText}>{link.label}</html.span>
                    </html.div>
                  ) : (
                    <RsdTextLink
                      href={external ? undefined : APP_PAGE_PATHS[link.page]}
                      onPress={() => (external ? onExternal(FEEDBACK_URL) : openAppPage(link.page))}
                      style={[styles.link, controlStyles.semiboldText]}
                    >
                      <html.span>{link.label}</html.span>
                      {external ? <RsdExternalMark variant="inline" ink={theme.brandText} /> : null}
                    </RsdTextLink>
                  )}
                </html.li>
              );
            })}
          </html.ul>
        </html.nav>
      </html.div>
      <RsdLatestReleaseLabel
        hrefBase={page === 'changelog' ? '' : APP_PAGE_PATHS.changelog}
        onPress={(id) => {
          if (page === 'changelog') onExternal(`#${id}`);
          else openAppPage('changelog', id);
        }}
      />
    </html.footer>
  );
}
