import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { paletteHex, type PaletteLabel } from '../../drawing/palette';
import {
  brandColors,
  colors,
  darkTheme,
  dimensions,
  fonts,
  motion,
} from '../../rsdDrawing/tokens.css';
import type { AdminTheme } from './adminContract';

// The console's own small set of the shipping page chrome (PageShell, BackLink, BrandMark,
// RuleLabel, StatusMessage, Button), built from html.* alone: the RSD components the information
// pages wear read React Native primitives, which would bring React Native Web into this entry.
// The layout answers to media queries rather than the window, so one markup fits every viewport.

const COPY = { back: 'Start drawing', wordmark: 'Splotch', suffix: 'Admin' } as const;
const CRAYON_LABELS: readonly PaletteLabel[] = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Blue',
  'Purple',
  'Pink',
];
const DRAWING_HREF = '/';

// Exclusive bands, as StyleX does not order overlapping queries by width.
const PHONE = '@media (max-width: 540px)';
const FRAMED = '@media (min-width: 540.02px) and (max-width: 920px)';
const SHEET_MAX_WIDTH_PX = 760;
const PAGE_PADDING = { top: '32px', side: '16px', bottom: '72px' } as const;
const GUTTER = 'clamp(20px, 5vw, 34px)';
const DISPLAY_FONT_SIZE = 'clamp(34px, 3.2vw + 17px, 46px)';
const TOPBAR_PADDING_PX = 18;
const BACK_BLOB_PX = 44;
const BACK_OVERHANG_PX = -11;
const BACK_CHEVRON_PX = 10;
const BACK_CHEVRON_STROKE_PX = 3;
const CRAYON = { width: 11, height: 7, gap: 4 } as const;
const PHONE_CRAYON = { width: 9, height: 5, gap: 3 } as const;
const WORDMARK_TRACKING = '0.14em';
const PHONE_WORDMARK_TRACKING = '0.06em';
const RULE_TRACKING = '0.14em';
const RULE_LINE_HEIGHT = 1.2;
const H1_LINE_HEIGHT = 1.08;
const H1_TRACKING = '-0.015em';
const PAGE_LINE_HEIGHT = 1.62;
const LEDE_LINE_HEIGHT = 1.6;
const STATUS_LINE_HEIGHT = 1.5;
const BUTTON_PRESS_SCALE = 0.96;
const BUTTON_LG_PADDING_BLOCK_PX = 14;

const styles = css.create({
  page: {
    boxSizing: 'border-box',
    minHeight: '100vh',
    paddingTop: { default: PAGE_PADDING.top, [FRAMED]: dimensions.space6, [PHONE]: 0 },
    paddingBottom: { default: PAGE_PADDING.bottom, [FRAMED]: dimensions.space6, [PHONE]: 0 },
    paddingInline: { default: PAGE_PADDING.side, [FRAMED]: dimensions.space6, [PHONE]: 0 },
    backgroundColor: { default: colors.appBg, [PHONE]: colors.surface },
    color: colors.textStrong,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
    lineHeight: PAGE_LINE_HEIGHT,
  },
  sheet: {
    boxSizing: 'border-box',
    maxWidth: SHEET_MAX_WIDTH_PX,
    marginInline: 'auto',
    paddingTop: { default: 0, [FRAMED]: dimensions.space3, [PHONE]: 0 },
    paddingBottom: dimensions.space8,
    paddingInline: GUTTER,
    backgroundColor: colors.surface,
    borderRadius: { default: dimensions.radiusLg, [PHONE]: 0 },
    boxShadow: { default: colors.floatShadow, [PHONE]: 'none' },
  },
  topbar: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: dimensions.space4,
    paddingBlock: TOPBAR_PADDING_PX,
  },
  back: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: dimensions.space2,
    minHeight: BACK_BLOB_PX,
    marginBlock: BACK_OVERHANG_PX,
    color: colors.brandText,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  backBlob: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: BACK_BLOB_PX,
    height: BACK_BLOB_PX,
    borderRadius: `${dimensions.radiusBlob1TopLeft} ${dimensions.radiusBlob1TopRight} ${dimensions.radiusBlob1BottomRight} ${dimensions.radiusBlob1BottomLeft}`,
    backgroundColor: colors.brandSolid,
  },
  backChevron: {
    width: BACK_CHEVRON_PX,
    height: BACK_CHEVRON_PX,
    marginLeft: BACK_CHEVRON_STROKE_PX,
    borderStyle: 'solid',
    borderColor: brandColors.onBrand,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: BACK_CHEVRON_STROKE_PX,
    borderLeftWidth: BACK_CHEVRON_STROKE_PX,
    transform: 'rotate(45deg)',
  },
  brand: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: { default: dimensions.space2, [PHONE]: '6px' },
    textDecoration: 'none',
  },
  crayons: {
    display: 'flex',
    flexDirection: 'row',
    gap: { default: CRAYON.gap, [PHONE]: PHONE_CRAYON.gap },
  },
  crayon: {
    width: { default: CRAYON.width, [PHONE]: PHONE_CRAYON.width },
    height: { default: CRAYON.height, [PHONE]: PHONE_CRAYON.height },
    borderRadius: dimensions.radiusPill,
  },
  wordmark: {
    color: colors.text,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    letterSpacing: { default: WORDMARK_TRACKING, [PHONE]: PHONE_WORDMARK_TRACKING },
    textTransform: 'uppercase',
  },
  // A phone shows only the suffix beside the back link; the name stays in the link's name.
  wordmarkName: {
    position: { default: 'static', [PHONE]: 'absolute' },
    width: { default: 'auto', [PHONE]: 1 },
    height: { default: 'auto', [PHONE]: 1 },
    overflow: { default: 'visible', [PHONE]: 'hidden' },
    clip: { default: 'auto', [PHONE]: 'rect(0, 0, 0, 0)' },
    whiteSpace: 'nowrap',
  },
  hero: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: dimensions.space4,
    paddingTop: dimensions.space2,
    paddingBottom: { default: dimensions.space7, [PHONE]: '28px' },
  },
  heroText: { flexGrow: 1, flexShrink: 1 },
  h1: {
    margin: 0,
    color: colors.textStrong,
    fontSize: DISPLAY_FONT_SIZE,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    lineHeight: H1_LINE_HEIGHT,
    letterSpacing: H1_TRACKING,
  },
  lede: {
    marginTop: dimensions.space4,
    marginBottom: 0,
    color: colors.text,
    fontSize: { default: dimensions.fontSizeLg, [PHONE]: dimensions.fontSizeMd },
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    lineHeight: LEDE_LINE_HEIGHT,
  },
  heroActions: { flexShrink: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: dimensions.space5 },
  rule: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
    margin: 0,
    color: colors.labelInk,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    letterSpacing: RULE_TRACKING,
    lineHeight: RULE_LINE_HEIGHT,
    textTransform: 'uppercase',
  },
  hairline: { flexGrow: 1, height: dimensions.borderWidth, backgroundColor: colors.border },
  status: {
    margin: 0,
    paddingBlock: dimensions.space2,
    paddingInline: dimensions.space3,
    borderRadius: dimensions.radiusSm,
    fontSize: dimensions.fontSizeSm,
    lineHeight: STATUS_LINE_HEIGHT,
  },
  success: { backgroundColor: colors.successWash, color: colors.successText },
  error: { backgroundColor: colors.dangerWash, color: colors.dangerText },
  warning: {
    backgroundColor: colors.warningWash,
    color: colors.warningText,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  button: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minHeight: dimensions.touchTargetMin,
    borderWidth: 0,
    borderRadius: dimensions.radiusMd,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': `scale(${BUTTON_PRESS_SCALE})` },
    transitionProperty: 'transform, background-color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
  md: {
    paddingBlock: dimensions.space3,
    paddingInline: dimensions.space5,
    fontSize: dimensions.fontSizeSm,
  },
  lg: {
    paddingBlock: BUTTON_LG_PADDING_BLOCK_PX,
    paddingInline: dimensions.space4,
    fontSize: dimensions.fontSizeMd,
  },
  brandFill: {
    backgroundColor: {
      default: colors.brandSolid,
      '@media (hover: hover)': { default: colors.brandSolid, ':hover': colors.brandSolidHover },
    },
    color: brandColors.onBrand,
  },
  washFill: {
    backgroundColor: {
      default: colors.brandWash,
      '@media (hover: hover)': { default: colors.brandWash, ':hover': colors.brandWashHover },
    },
    color: colors.brandText,
  },
  disabled: {
    backgroundColor: colors.controlTrack,
    color: colors.text,
    opacity: dimensions.disabledOpacity,
    cursor: 'auto',
    transform: 'scale(1)',
  },
});

export function AdminPage({
  theme,
  actions,
  children,
}: {
  theme: AdminTheme;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <html.main style={[styles.page, theme === 'dark' && darkTheme]}>
      <html.div style={styles.sheet}>
        <html.div style={styles.topbar}>
          <html.a href={DRAWING_HREF} style={styles.back}>
            <html.span aria-hidden style={styles.backBlob}>
              <html.span style={styles.backChevron} />
            </html.span>
            {COPY.back}
          </html.a>
          <html.a href={DRAWING_HREF} style={styles.brand}>
            <html.span aria-hidden style={styles.crayons}>
              {CRAYON_LABELS.map((label) => (
                <html.span key={label} style={[styles.crayon, crayonFill.hue(paletteHex(label))]} />
              ))}
            </html.span>
            <html.span style={styles.wordmark}>
              <html.span style={styles.wordmarkName}>{COPY.wordmark} </html.span>
              {COPY.suffix}
            </html.span>
          </html.a>
        </html.div>
        <html.div style={styles.hero}>
          <html.div style={styles.heroText}>
            <html.h1 style={styles.h1}>Admin</html.h1>
            <html.p style={styles.lede}>Manage AI access codes</html.p>
          </html.div>
          <html.div style={styles.heroActions}>{actions}</html.div>
        </html.div>
        {children}
      </html.div>
    </html.main>
  );
}

const crayonFill = css.create({ hue: (backgroundColor: string) => ({ backgroundColor }) });

export function AdminSection({ children }: { children: ReactNode }) {
  return <html.section style={styles.section}>{children}</html.section>;
}

export function AdminRuleLabel({ children, count }: { children: string; count?: number | string }) {
  return (
    <html.h2 style={styles.rule}>
      <html.span>{count === undefined ? children : `${children} · ${count}`}</html.span>
      <html.span aria-hidden style={styles.hairline} />
    </html.h2>
  );
}

export type AdminMessageStatus = 'success' | 'error' | 'warning';

// Errors interrupt (alert); successes and warnings wait their turn (status).
export function AdminStatusMessage({
  status,
  children,
}: {
  status: AdminMessageStatus;
  children: ReactNode;
}) {
  return (
    <html.p
      role={status === 'error' ? 'alert' : 'status'}
      aria-live={status === 'error' ? 'assertive' : 'polite'}
      style={[styles.status, styles[status]]}
    >
      {children}
    </html.p>
  );
}

// A field's label, read aloud but never seen, and out of flow so the row it sits in keeps its gap.
export function AdminHiddenLabel({ field, children }: { field: string; children: string }) {
  return (
    <html.label for={field} style={styles.visuallyHidden}>
      {children}
    </html.label>
  );
}

// A live region read aloud but never seen, for news the eye gets elsewhere (a copied row's label).
export function AdminAnnouncement({ children }: { children: string }) {
  return (
    <html.span role="status" style={styles.visuallyHidden}>
      {children}
    </html.span>
  );
}

export function AdminButton({
  variant,
  size,
  disabled,
  label,
  onPress,
  children,
}: {
  variant: 'brand' | 'wash';
  size: 'md' | 'lg';
  disabled: boolean;
  label?: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <html.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      style={[
        styles.button,
        styles[size],
        variant === 'brand' ? styles.brandFill : styles.washFill,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </html.button>
  );
}
