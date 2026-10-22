import { useEffect, useMemo, useRef, type ReactNode, type Ref, type RefObject } from 'react';
import { Platform, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { ScrollView } from '../platform/ScrollView';
import { useForcedColors } from '../platform/forcedColors';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInitialSafeAreaMetrics } from '../platform/safeAreaMetrics';
import { SvgXml } from '../platform/svg';
import { css, html } from 'react-strict-dom';
import type { BackLabel } from '../lib/components/page/backLabel';
import {
  BREAKPOINT_EPSILON_PX,
  NARROW_PHONE_MIN_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  SHORT_PAGE_HEIGHT_PX,
} from '../lib/breakpoints';
import { DrawingAppearanceProvider, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { paletteHex, type PaletteLabel } from '../drawing/palette';
import { DRAWING_ON_BRAND, DRAWING_THEMES } from '../drawing/theme';
import { bootAppearance } from '../platform/bootAppearance';
import { openAppPage, setDocumentTitle } from '../platform/appPath';
import { APP_PAGE_PATHS, INFORMATION_TOP_ID } from '../information/appPages';
import { landFocus, retainFocus } from './landFocus';
import { RsdNotFoundLink } from './notFoundLink';
import { RsdPageHero } from './RsdPageHero';
import { pageTextRef } from './pageTypography';
import { RsdNotFoundFooter } from './notFoundFooter';
import { INFORMATION_PAGE_SCROLLER_TEST_ID, PAGE_FRAMED_MAX_WIDTH_PX } from './pageFrame';
import { useBackLabel, usePageNavigation } from './pageDocumentState';
export { PAGE_FRAMED_MAX_WIDTH_PX } from './pageFrame';
import { RsdPressable } from './RsdPressable';
import { RsdPageAnchor } from './RsdPageAnchor';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { blobPath, blobXml } from './blob';
import { styles as controlStyles } from './controls';
import { fontTheme } from './fontTheme';
import { useNativeIconMarkup } from './iconRegistry';
import { colors, darkTheme, dimensions, fonts } from './tokens.css';

// NotFoundPage.svelte's copy, the cold-visit back label (backLabel.ts) and the literals PageShell,
// BackLink, BrandMark and CrayonStrip write beside their tokens. Local for the StyleX web compile;
// native-web-not-found.test.mjs reads every shipping source and fails on divergence.
export const NOT_FOUND_COPY = {
  documentTitle: 'Page not found · Splotch',
  title: 'This page wandered off',
  lede: 'The link may be old. These are still here:',
  startDrawing: 'Start drawing',
  changelog: 'Changelog',
  privacy: 'Privacy',
  wordmark: 'Splotch',
} as const;
export const CRAYON_LABELS: readonly PaletteLabel[] = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Blue',
  'Purple',
  'Pink',
];
const PAGE_SHEET_MAX_WIDTH_PX = 760;
const PAGE_GUTTER = { minPx: 20, viewportWidthPercent: 5, maxPx: 34 } as const;
export const BACK_BLOB_PX = 44;
const BACK_ICON_PX = 24;
const NOT_FOUND_MARK_PX = 80;
const SHORT_NOT_FOUND_MARK_PX = 56;
const NOT_FOUND_MARK_TURN_DEG = -8;
const PERCENT = 100;
const SHORT_PAGE_TOP_PX = 12;
const SHORT_SHEET_GUTTER_PX = 32;
const SHORT_TOPBAR_PADDING_PX = 10;
const SHORT_BACK_OVERHANG_PX = -10;
const SHORT_BACK_BLOB_PX = 36;
const FORCED_BLOB_BORDER_PX = 1;
const WORDMARK_TRACKING_EM = { wide: 0.14, phone: 0.06 } as const;
const CRAYON = { wide: { width: 11, height: 7, gap: 4 }, phone: { width: 9, height: 5, gap: 3 } };
const DESKTOP_PAGE_PADDING_PX = { top: 32, side: 16, bottom: 72 } as const;
const TOPBAR_PADDING_PX = 18;
const TOPBAR_GAP_PX = 16;
const BACK_GAP_PX = 10;
const BACK_OVERHANG_PX = -11;
const BRAND_GAP_PX = { wide: 8, phone: 6 } as const;
const SHEET_PADDING_PX = { framed: { top: 12, bottom: 36 }, open: { top: 0, bottom: 40 } };
const FRAMED_PAGE_PADDING_PX = 24;
const WORDMARK_FONT_PX = 12;

type Frame = 'phone' | 'framed' | 'desktop';

function pageFrame(width: number): Frame {
  if (width <= PHONE_MAX_WIDTH_PX) return 'phone';
  return width <= PAGE_FRAMED_MAX_WIDTH_PX ? 'framed' : 'desktop';
}

function gutter(width: number) {
  const { minPx, viewportWidthPercent, maxPx } = PAGE_GUTTER;
  return Math.min(maxPx, Math.max(minPx, (width * viewportWidthPercent) / PERCENT));
}

const scroll = StyleSheet.create({ fill: { flex: 1 }, content: { flexGrow: 1 } });

const styles = css.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    alignItems: 'center',
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
    color: colors.textStrong,
  },
  ground: { backgroundColor: colors.appBg },
  plain: { backgroundColor: colors.surface },
  pagePadding: (top: number, right: number, bottom: number, left: number) => ({
    paddingTop: top,
    paddingRight: right,
    paddingBottom: bottom,
    paddingLeft: left,
  }),
  sheet: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: PAGE_SHEET_MAX_WIDTH_PX,
    backgroundColor: colors.surface,
  },
  card: { borderRadius: dimensions.radiusLg, boxShadow: colors.floatShadow },
  sheetPadding: (top: number, side: number, bottom: number) => ({
    paddingTop: top,
    paddingBottom: bottom,
    paddingLeft: side,
    paddingRight: side,
  }),
  topbar: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: TOPBAR_GAP_PX,
    paddingTop: TOPBAR_PADDING_PX,
    paddingBottom: TOPBAR_PADDING_PX,
  },
  shortTopbar: { paddingTop: SHORT_TOPBAR_PADDING_PX, paddingBottom: SHORT_TOPBAR_PADDING_PX },
  // Native text follows the OS text size, so a large one can leave the mark too little room beside
  // the back link: it takes its own row, at the end, instead of breaking inside its word.
  nativeBrand: { marginInlineStart: 'auto' },
  back: (overhang: number) => ({
    flexShrink: 0,
    whiteSpace: 'nowrap',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: BACK_GAP_PX,
    minHeight: BACK_BLOB_PX,
    marginTop: overhang,
    marginBottom: overhang,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  }),
  backLabel: { color: colors.brandText, fontSize: dimensions.fontSizeMd },
  blob: (shadow: string) => ({
    width: BACK_BLOB_PX,
    height: BACK_BLOB_PX,
    borderRadius: BACK_BLOB_PX / 2,
    boxShadow: shadow,
  }),
  blobSize: (size: number) => ({ width: size, height: size, borderRadius: size / 2 }),
  brand: (gap: number) => ({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap }),
  brandLink: { display: 'flex' },
  crayons: (gap: number) => ({ display: 'flex', flexDirection: 'row', gap }),
  crayon: (width: number, height: number, backgroundColor: string) => ({
    width,
    height,
    borderRadius: height / 2,
    backgroundColor,
  }),
  wordmark: (letterSpacing: number) => ({
    color: colors.text,
    fontSize: dimensions.fontSizeXs,
    letterSpacing,
    textTransform: 'uppercase',
  }),
  body: (gap: string) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap,
    paddingBottom: dimensions.space8,
  }),
  links: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: dimensions.space3,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  firstLink: { flexBasis: '100%' },
  mark: { display: 'flex', transform: `rotate(${NOT_FOUND_MARK_TURN_DEG}deg)` },
});

function startDrawing() {
  openAppPage('drawing');
}

// The system-colour blob shipping's BackToTopLink draws in forced colors, a CanvasText border inside
// its edge; BackLink.svelte leaves its own to the browser, which blanks the disc and the chevron.
function withForcedBorder(xml: string, size: number) {
  const inset = FORCED_BLOB_BORDER_PX / 2;
  const edge = `<path d="${blobPath('radiusBlob1', size, size, inset)}" fill="none" stroke="CanvasText" stroke-width="${FORCED_BLOB_BORDER_PX}"/>`;
  return xml.replace('</svg>', `${edge}</svg>`);
}

// BackLink.svelte on a cold visit: the brand paint blob holding a chevron, then its label.
export function RsdBackLink({
  label,
  short,
  onDrawingReturn,
}: {
  label: BackLabel;
  short: boolean;
  onDrawingReturn: () => void;
}) {
  const size = short ? SHORT_BACK_BLOB_PX : BACK_BLOB_PX;
  const theme = useDrawingAppearance();
  const chevron = useNativeIconMarkup('chevron-left')?.[theme];
  const { brandSolid } = DRAWING_THEMES[theme];
  const forced = useForcedColors();
  const xml = useMemo(() => {
    const disc = blobXml({
      shape: 'radiusBlob1',
      size,
      fill: forced ? 'Canvas' : brandSolid,
      icon: chevron
        ? { markup: chevron, size: BACK_ICON_PX, ink: forced ? 'CanvasText' : DRAWING_ON_BRAND }
        : undefined,
    });
    return forced ? withForcedBorder(disc, size) : disc;
  }, [brandSolid, chevron, forced, size]);
  const face = (
    <>
      <html.div aria-hidden style={[styles.blob(blobShadow(brandSolid)), styles.blobSize(size)]}>
        <SvgXml xml={xml} width={size} height={size} />
      </html.div>
      <html.span style={[controlStyles.boldText, styles.backLabel]}>{label}</html.span>
    </>
  );
  const style = styles.back(short ? SHORT_BACK_OVERHANG_PX : BACK_OVERHANG_PX);
  if (Platform.OS === 'web')
    return (
      <RsdPageAnchor href={APP_PAGE_PATHS.drawing} onFollow={onDrawingReturn} style={style}>
        {face}
      </RsdPageAnchor>
    );
  return (
    <RsdPressable type="button" role="link" style={style} onClick={onDrawingReturn}>
      {face}
    </RsdPressable>
  );
}

// Shipping mixes 35% of --brand-solid into transparent; React Native has no color-mix().
const BLOB_SHADOW_ALPHA = 0.35;
function blobShadow(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `0 3px 8px rgba(${red}, ${green}, ${blue}, ${BLOB_SHADOW_ALPHA})`;
}

// PageShell.svelte's masthead mark is a second anchor home on the web; native shows the mark alone.
export function RsdBrandMark({
  phone,
  narrow: pinnedNarrow,
  suffix,
  onDrawingReturn,
}: {
  phone: boolean;
  // The styleguide's specimen pins it; the page sheet follows the window.
  narrow?: boolean;
  suffix?: string;
  onDrawingReturn: () => void;
}) {
  const narrowWindow =
    useWindowDimensions().width <= NARROW_PHONE_MIN_WIDTH_PX - BREAKPOINT_EPSILON_PX;
  const narrow = pinnedNarrow ?? narrowWindow;
  const crayon = CRAYON[phone ? 'phone' : 'wide'];
  const tracking = WORDMARK_TRACKING_EM[phone ? 'phone' : 'wide'];
  const mark = (
    <html.div
      style={[
        styles.brand(BRAND_GAP_PX[phone ? 'phone' : 'wide']),
        Platform.OS !== 'web' && styles.nativeBrand,
      ]}
    >
      {!narrow && (
        <html.div aria-hidden style={styles.crayons(crayon.gap)}>
          {CRAYON_LABELS.map((label) => (
            <html.div
              key={label}
              style={styles.crayon(crayon.width, crayon.height, paletteHex(label))}
            />
          ))}
        </html.div>
      )}
      <html.span style={[controlStyles.boldText, styles.wordmark(WORDMARK_FONT_PX * tracking)]}>
        {suffix === undefined ? (
          NOT_FOUND_COPY.wordmark
        ) : phone ? (
          // BrandMark.svelte: at phone width a two-word mark would wrap beside the back link, so
          // it shows only its suffix and keeps the name for the link's accessible name.
          <>
            <RsdVisuallyHidden>{`${NOT_FOUND_COPY.wordmark} `}</RsdVisuallyHidden>
            {suffix}
          </>
        ) : (
          `${NOT_FOUND_COPY.wordmark} ${suffix}`
        )}
      </html.span>
    </html.div>
  );
  if (Platform.OS !== 'web') return mark;
  return (
    <RsdPageAnchor
      href={APP_PAGE_PATHS.drawing}
      onFollow={onDrawingReturn}
      style={styles.brandLink}
    >
      {mark}
    </RsdPageAnchor>
  );
}

const PAGE_SCROLL_REPORT_MS = 16;

export function RsdPageSheet({
  title,
  lede,
  children,
  scrollRef,
  onBodyOffset,
  backLabel = NOT_FOUND_COPY.startDrawing,
  onScroll,
  collapsibleLede = true,
  wordmarkSuffix,
  onDrawingReturn = startDrawing,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  scrollRef?: Ref<ScrollViewInstance>;
  onBodyOffset?: (y: number) => void;
  backLabel?: BackLabel;
  onScroll?: (y: number) => void;
  collapsibleLede?: boolean;
  // The word after "Splotch" in the masthead's mark: /beta's "beta".
  wordmarkSuffix?: string;
  onDrawingReturn?: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const theme = useDrawingAppearance();
  const window = useWindowDimensions();
  // PageShell adds safe-area spacing except for the short phone's explicitly edge-to-edge sides.
  const insets = useSafeAreaInsets();
  const frame = pageFrame(window.width);
  const phone = frame === 'phone';
  const short = window.height <= SHORT_PAGE_HEIGHT_PX;
  const side = short && !phone ? SHORT_SHEET_GUTTER_PX : gutter(window.width);
  const sheet = short
    ? { top: 0, bottom: SHEET_PADDING_PX.framed.bottom }
    : phone || frame === 'desktop'
      ? SHEET_PADDING_PX.open
      : SHEET_PADDING_PX.framed;
  const page = short
    ? {
        top: SHORT_PAGE_TOP_PX,
        side: phone ? 0 : FRAMED_PAGE_PADDING_PX,
        bottom: FRAMED_PAGE_PADDING_PX,
      }
    : frame === 'desktop'
      ? DESKTOP_PAGE_PADDING_PX
      : phone
        ? { top: 0, side: 0, bottom: 0 }
        : {
            top: FRAMED_PAGE_PADDING_PX,
            side: FRAMED_PAGE_PADDING_PX,
            bottom: FRAMED_PAGE_PADDING_PX,
          };
  return (
    <ScrollView
      testID={INFORMATION_PAGE_SCROLLER_TEST_ID}
      ref={scrollRef}
      style={scroll.fill}
      contentContainerStyle={scroll.content}
      scrollEventThrottle={PAGE_SCROLL_REPORT_MS}
      onScroll={({ nativeEvent }) => onScroll?.(nativeEvent.contentOffset.y)}
    >
      <PageSheetFocus title={title} titleRef={titleRef}>
        <html.main
          ref={pageTextRef}
          id={INFORMATION_TOP_ID}
          style={[
            styles.page,
            phone ? styles.plain : styles.ground,
            styles.pagePadding(
              page.top + insets.top,
              short && phone ? 0 : page.side + insets.right,
              page.bottom + insets.bottom,
              short && phone ? 0 : page.side + insets.left
            ),
            fontTheme,
            theme === 'dark' && darkTheme,
          ]}
        >
          <html.div
            style={[
              styles.sheet,
              !phone && styles.card,
              styles.sheetPadding(sheet.top, side, sheet.bottom),
            ]}
          >
            <html.div style={[styles.topbar, short && styles.shortTopbar]}>
              <RsdBackLink label={backLabel} short={short} onDrawingReturn={onDrawingReturn} />
              <RsdBrandMark
                phone={phone}
                suffix={wordmarkSuffix}
                onDrawingReturn={onDrawingReturn}
              />
            </html.div>
            {/* RN Web does not report position-only layout changes on the body. */}
            <View
              testID="information-page-hero"
              onLayout={({ nativeEvent }) =>
                onBodyOffset?.(
                  nativeEvent.layout.y + nativeEvent.layout.height + page.top + insets.top
                )
              }
            >
              <RsdPageHero
                title={title}
                lede={lede}
                titleRef={titleRef}
                width={window.width}
                phone={phone}
                short={short}
                collapsibleLede={collapsibleLede}
              />
            </View>
            <View
              testID="information-page-body"
              onLayout={({ nativeEvent }) =>
                onBodyOffset?.(nativeEvent.layout.y + page.top + insets.top)
              }
            >
              {children}
            </View>
          </html.div>
        </html.main>
      </PageSheetFocus>
    </ScrollView>
  );
}

function PageSheetFocus({
  title,
  titleRef,
  children,
}: {
  title: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}) {
  useEffect(() => {
    const restore = retainFocus();
    landFocus(titleRef.current);
    return restore;
  }, [title, titleRef]);
  return children;
}

export function RsdNotFoundPage() {
  const window = useWindowDimensions();
  const short = window.height <= SHORT_PAGE_HEIGHT_PX;
  const backLabel = useBackLabel(false);
  const openAppPage = usePageNavigation();
  const initialMetrics = useInitialSafeAreaMetrics();
  useEffect(() => {
    setDocumentTitle(NOT_FOUND_COPY.documentTitle);
  }, []);
  return (
    <DrawingAppearanceProvider preference={bootAppearance()}>
      <SafeAreaProvider initialMetrics={initialMetrics} style={scroll.fill}>
        <RsdPageSheet
          title={NOT_FOUND_COPY.title}
          lede={NOT_FOUND_COPY.lede}
          backLabel={backLabel}
          collapsibleLede={false}
          onDrawingReturn={() => openAppPage('drawing')}
        >
          <html.div style={styles.body(short ? dimensions.space4 : dimensions.space6)}>
            <html.div aria-hidden style={styles.mark}>
              <RsdSplotchyIcon size={short ? SHORT_NOT_FOUND_MARK_PX : NOT_FOUND_MARK_PX} />
            </html.div>
            <html.ul role="list" style={styles.links}>
              <html.li style={window.width <= PHONE_MAX_WIDTH_PX && styles.firstLink}>
                <RsdNotFoundLink page="drawing" variant="brand" onOpen={openAppPage}>
                  {NOT_FOUND_COPY.startDrawing}
                </RsdNotFoundLink>
              </html.li>
              <html.li>
                <RsdNotFoundLink page="changelog" variant="wash" onOpen={openAppPage}>
                  {NOT_FOUND_COPY.changelog}
                </RsdNotFoundLink>
              </html.li>
              <html.li>
                <RsdNotFoundLink page="privacy" variant="wash" onOpen={openAppPage}>
                  {NOT_FOUND_COPY.privacy}
                </RsdNotFoundLink>
              </html.li>
            </html.ul>
          </html.div>
          <RsdNotFoundFooter openAppPage={openAppPage} />
        </RsdPageSheet>
      </SafeAreaProvider>
    </DrawingAppearanceProvider>
  );
}
