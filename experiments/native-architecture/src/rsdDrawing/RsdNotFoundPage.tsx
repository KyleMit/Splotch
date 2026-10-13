import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { css, html } from 'react-strict-dom';
import { PHONE_MAX_WIDTH_PX } from '../../../../web/src/lib/breakpoints';
import { DrawingAppearanceProvider, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { paletteHex, type PaletteLabel } from '../drawing/palette';
import { DRAWING_ON_BRAND, DRAWING_THEMES } from '../drawing/theme';
import { bootAppearance } from '../platform/bootAppearance';
import { setDocumentTitle } from '../platform/appPath';
import { RsdButton } from './RsdButton';
import { RsdPressable } from './RsdPressable';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { blobXml } from './blob';
import { styles as controlStyles } from './controls';
import { displayFontSize } from './displayType';
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
export const PAGE_SHEET_MAX_WIDTH_PX = 760;
export const PAGE_FRAMED_MAX_WIDTH_PX = 920;
export const PAGE_GUTTER = { minPx: 20, viewportWidthPercent: 5, maxPx: 34 } as const;
export const BACK_BLOB_PX = 44;
export const BACK_ICON_PX = 24;
export const NOT_FOUND_MARK_PX = 80;
export const NOT_FOUND_MARK_TURN_DEG = -8;
const PERCENT = 100;
const H1_LINE_HEIGHT = 1.08;
const H1_TRACKING_EM = -0.015;
const LEDE_LINE_HEIGHT = 1.6;
const WORDMARK_TRACKING_EM = { wide: 0.14, phone: 0.06 } as const;
const CRAYON = { wide: { width: 11, height: 7, gap: 4 }, phone: { width: 9, height: 5, gap: 3 } };
const DESKTOP_PAGE_PADDING_PX = { top: 32, side: 16, bottom: 72 } as const;
const TOPBAR_PADDING_PX = 18;
const TOPBAR_GAP_PX = 16;
const BACK_GAP_PX = 10;
const BACK_OVERHANG_PX = -11;
const BRAND_GAP_PX = { wide: 8, phone: 6 } as const;
const SHEET_PADDING_PX = { framed: { top: 12, bottom: 36 }, open: { top: 0, bottom: 40 } };
const HERO_BOTTOM_PX = { wide: 32, phone: 28 } as const;
const FRAMED_PAGE_PADDING_PX = 24;
// The type steps these lengths scale with: --font-size-xs for the wordmark, -lg and -md for the lede.
const WORDMARK_FONT_PX = 12;
const LEDE_FONT_PX = { wide: 18, phone: 16 } as const;

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
  pagePadding: (top: number, side: number, bottom: number) => ({
    paddingTop: top,
    paddingBottom: bottom,
    paddingLeft: side,
    paddingRight: side,
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
    gap: TOPBAR_GAP_PX,
    paddingTop: TOPBAR_PADDING_PX,
    paddingBottom: TOPBAR_PADDING_PX,
  },
  back: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: BACK_GAP_PX,
    minHeight: BACK_BLOB_PX,
    marginTop: BACK_OVERHANG_PX,
    marginBottom: BACK_OVERHANG_PX,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  backLabel: { color: colors.brandText, fontSize: dimensions.fontSizeMd },
  blob: (shadow: string) => ({
    width: BACK_BLOB_PX,
    height: BACK_BLOB_PX,
    borderRadius: BACK_BLOB_PX / 2,
    boxShadow: shadow,
  }),
  brand: (gap: number) => ({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap }),
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
  hero: (bottom: number) => ({ paddingTop: dimensions.space2, paddingBottom: bottom }),
  title: (fontSize: number) => ({
    margin: 0,
    color: colors.textStrong,
    fontSize,
    lineHeight: H1_LINE_HEIGHT,
    letterSpacing: fontSize * H1_TRACKING_EM,
  }),
  lede: (fontSize: number) => ({
    marginTop: dimensions.space4,
    marginBottom: 0,
    color: colors.text,
    fontSize,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    lineHeight: LEDE_LINE_HEIGHT,
  }),
  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: dimensions.space6,
    paddingBottom: dimensions.space8,
  },
  mark: { transform: `rotate(${NOT_FOUND_MARK_TURN_DEG}deg)` },
});

function startDrawing() {
  globalThis.location?.assign('/');
}

// BackLink.svelte on a cold visit: the brand paint blob holding a chevron, then its label.
function BackLink() {
  const theme = useDrawingAppearance();
  const chevron = useNativeIconMarkup('chevron-left')?.[theme];
  const { brandSolid } = DRAWING_THEMES[theme];
  const xml = useMemo(
    () =>
      blobXml({
        shape: 'radiusBlob1',
        size: BACK_BLOB_PX,
        fill: brandSolid,
        icon: chevron ? { markup: chevron, size: BACK_ICON_PX, ink: DRAWING_ON_BRAND } : undefined,
      }),
    [brandSolid, chevron]
  );
  return (
    <RsdPressable type="button" role="link" style={styles.back} onClick={startDrawing}>
      <html.div aria-hidden style={styles.blob(blobShadow(brandSolid))}>
        <SvgXml xml={xml} width={BACK_BLOB_PX} height={BACK_BLOB_PX} />
      </html.div>
      <html.span style={[controlStyles.boldText, styles.backLabel]}>
        {NOT_FOUND_COPY.startDrawing}
      </html.span>
    </RsdPressable>
  );
}

// Shipping mixes 35% of --brand-solid into transparent; React Native has no color-mix().
const BLOB_SHADOW_ALPHA = 0.35;
function blobShadow(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `0 3px 8px rgba(${red}, ${green}, ${blue}, ${BLOB_SHADOW_ALPHA})`;
}

function BrandMark({ phone }: { phone: boolean }) {
  const crayon = CRAYON[phone ? 'phone' : 'wide'];
  const tracking = WORDMARK_TRACKING_EM[phone ? 'phone' : 'wide'];
  return (
    <html.div style={styles.brand(BRAND_GAP_PX[phone ? 'phone' : 'wide'])}>
      <html.div aria-hidden style={styles.crayons(crayon.gap)}>
        {CRAYON_LABELS.map((label) => (
          <html.div
            key={label}
            style={styles.crayon(crayon.width, crayon.height, paletteHex(label))}
          />
        ))}
      </html.div>
      <html.span style={[controlStyles.boldText, styles.wordmark(WORDMARK_FONT_PX * tracking)]}>
        {NOT_FOUND_COPY.wordmark}
      </html.span>
    </html.div>
  );
}

function NotFoundSheet() {
  const theme = useDrawingAppearance();
  const window = useWindowDimensions();
  const frame = pageFrame(window.width);
  const phone = frame === 'phone';
  const side = gutter(window.width);
  const sheet = phone || frame === 'desktop' ? SHEET_PADDING_PX.open : SHEET_PADDING_PX.framed;
  const page =
    frame === 'desktop'
      ? DESKTOP_PAGE_PADDING_PX
      : phone
        ? { top: 0, side: 0, bottom: 0 }
        : {
            top: FRAMED_PAGE_PADDING_PX,
            side: FRAMED_PAGE_PADDING_PX,
            bottom: FRAMED_PAGE_PADDING_PX,
          };
  return (
    <ScrollView style={scroll.fill} contentContainerStyle={scroll.content}>
      <html.main
        style={[
          styles.page,
          phone ? styles.plain : styles.ground,
          styles.pagePadding(page.top, page.side, page.bottom),
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
          <html.div style={styles.topbar}>
            <BackLink />
            <BrandMark phone={phone} />
          </html.div>
          <html.div style={styles.hero(HERO_BOTTOM_PX[phone ? 'phone' : 'wide'])}>
            <html.h1 style={[controlStyles.boldText, styles.title(displayFontSize(window.width))]}>
              {NOT_FOUND_COPY.title}
            </html.h1>
            <html.p style={styles.lede(LEDE_FONT_PX[phone ? 'phone' : 'wide'])}>
              {NOT_FOUND_COPY.lede}
            </html.p>
          </html.div>
          <html.div style={styles.body}>
            <html.div aria-hidden style={styles.mark}>
              <RsdSplotchyIcon size={NOT_FOUND_MARK_PX} />
            </html.div>
            <RsdButton variant="brand" size="lg" onPress={startDrawing}>
              {NOT_FOUND_COPY.startDrawing}
            </RsdButton>
          </html.div>
        </html.div>
      </html.main>
    </ScrollView>
  );
}

// Shipping's NotFoundPage.svelte, which a host shows for any path but the drawing screen's. This
// export has no Changelog or Privacy page to offer beside Start drawing, so it offers that alone.
export function RsdNotFoundPage() {
  useEffect(() => setDocumentTitle(NOT_FOUND_COPY.documentTitle), []);
  return (
    <DrawingAppearanceProvider preference={bootAppearance()}>
      <NotFoundSheet />
    </DrawingAppearanceProvider>
  );
}
