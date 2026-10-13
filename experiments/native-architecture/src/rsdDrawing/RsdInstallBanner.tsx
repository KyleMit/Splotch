import { useCallback, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { APP_HOME_SCREEN_NAME } from '../../../../web/src/lib/appIdentity';
import { TABLET_MIN_SIDE_PX } from '../../../../web/src/lib/breakpoints';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { CONTROL_GAP, DRAWING_ON_BRAND, DRAWING_SCALE, TOUCH_TARGET } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { installPrompt } from '../platform/installPrompt';
import { INSTALL_BANNER_COPY, INSTALL_PROMPT_COPY } from '../install/installCopy';
import { useInstallBanner, type InstallBanner } from '../install/useInstallBanner';
import { styles as controlStyles } from './controls';
import { HeaderControl } from './DialogHeader';
import { EDGE_INSET_PX } from './edgeLayout';
import {
  boxOf,
  shrinkTarget,
  useBannerMotion,
  useBannerPresence,
  type Box,
} from './installBannerMotion';
import { RsdIcon } from './RsdIcon';
import { INSTALL_HINT_ID, RsdInstallHint, RsdInstallParting } from './RsdInstallText';
import { RsdPressable } from './RsdPressable';
import { brandColors, colors, dimensions, motion } from './tokens.css';

// InstallBanner.svelte's literals and the app.css .banner-dismiss offset. They stay in this module
// because the StyleX web compile resolves only local constants and token files inside css.create;
// tools/tests/native-install-banner-drift.test.mjs reads each back from the shipping source.
const MAX_WIDTH_PX = 420;
const PREVIEW_ICON_PX = 52;
const PREVIEW_COLUMN_PX = 60;
const PREVIEW_LABEL_LINE_HEIGHT = 1.2;
const COPY_LINE_HEIGHT = 1.25;
const CTA_HEIGHT_PX = 44;
const CTA_PRESS_SCALE = 0.96;
const CTA_ICON_PX = 18;
const DISMISS_OUTSET_PX = 2;
const CHEVRON_TURN_DEG = 180;
const CHEVRON_TURNED = `rotate(${CHEVRON_TURN_DEG}deg)`;
// This lift previews a home-screen icon in light mode rather than floating app chrome; shipping
// writes it as rgb(0 0 0 / n%), which React Native's parser reads only as rgba().
const PREVIEW_LIGHT_SHADOW = '0 1px 2px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.1)';

export const INSTALL_BANNER_METRICS = {
  maxWidthPx: MAX_WIDTH_PX,
  previewIconPx: PREVIEW_ICON_PX,
  previewColumnPx: PREVIEW_COLUMN_PX,
  previewLabelLineHeight: PREVIEW_LABEL_LINE_HEIGHT,
  copyLineHeight: COPY_LINE_HEIGHT,
  ctaHeightPx: CTA_HEIGHT_PX,
  ctaPressScale: CTA_PRESS_SCALE,
  ctaIconPx: CTA_ICON_PX,
  dismissOutsetPx: DISMISS_OUTSET_PX,
  chevronTurnDeg: CHEVRON_TURN_DEG,
  previewLightShadow: PREVIEW_LIGHT_SHADOW,
} as const;
// The home-screen icon the web export serves from the shipping static files (build-native-web.mjs);
// the native apps never show the banner, having no install step.
export const INSTALL_PREVIEW_ICON_SRC = '/apple-touch-icon.png';

type DockInsets = Readonly<{ top: number; inline: number; bottom: number; stacked: boolean }>;

// The shipping bottom dock: below 600px wide in portrait the banner spans the screen less one
// gutter and rides above the corner controls; wider, it stays between them on the bottom edge.
// The corners here are this app's corner controls, at least the touch target and growing with
// the drawer chevron's Button Size. The top bound keeps the card below Clear.
export function installDockInsets(
  window: Readonly<{ width: number; height: number }>,
  controlSize: number
): DockInsets {
  const corner = EDGE_INSET_PX + Math.max(controlSize, TOUCH_TARGET);
  const top = corner + CONTROL_GAP;
  const stacked = window.width < TABLET_MIN_SIDE_PX && window.height >= window.width;
  return stacked
    ? { top, inline: DRAWING_SCALE.space4, bottom: corner + DRAWING_SCALE.space2, stacked }
    : { top, inline: corner + DRAWING_SCALE.space4, bottom: DRAWING_SCALE.space4, stacked };
}

// The shipping Install Banner, floating in the paper area where shipping docks it between the
// corner controls. Only the card takes touches; the rest of the strip passes them to the paper.
export function RsdInstallBanner({
  strokes,
  hidden,
  controlSize,
}: {
  strokes: number;
  hidden: boolean;
  controlSize: number;
}) {
  const banner = useInstallBanner(installPrompt, strokes, hidden);
  const dock = installDockInsets(useWindowDimensions(), controlSize);
  const area = useRef<Box | null>(null);
  const card = useRef<Box | null>(null);
  const { shown, gone } = useBannerPresence(banner.present, banner.parting);
  const measure = useCallback(() => shrinkTarget(area.current, card.current), []);
  const motionStyle = useBannerMotion(banner.present, shown, gone, measure);
  if (!shown || hidden) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[
        layers.overlay,
        {
          paddingTop: dock.top,
          paddingLeft: dock.inline,
          paddingRight: dock.inline,
          paddingBottom: dock.bottom,
        },
      ]}
      onLayout={(event) => {
        area.current = boxOf(event);
      }}
    >
      <Animated.View
        style={[layers.card, motionStyle]}
        onLayout={(event) => {
          card.current = boxOf(event);
        }}
      >
        <html.div style={styles.banner}>
          {shown.parting ? (
            <RsdInstallParting />
          ) : (
            <InstallCard banner={banner} stacked={dock.stacked} />
          )}
        </html.div>
      </Animated.View>
    </View>
  );
}

function InstallCard({ banner, stacked }: { banner: InstallBanner; stacked: boolean }) {
  const copy = INSTALL_PROMPT_COPY[banner.stage];
  const cta = <InstallCta banner={banner} stacked={stacked} />;
  // React Native has no flex `order`, so the stacked phone layout writes the close before the
  // full-width button that shipping reorders onto its own line.
  const dismiss = (
    <html.div style={styles.dismiss}>
      <HeaderControl
        kind="close"
        label={INSTALL_BANNER_COPY.dismiss}
        disabled={false}
        onClick={banner.dismiss}
      />
    </html.div>
  );
  return (
    <>
      <html.div style={[styles.main, stacked && styles.mainStacked]}>
        <InstallPreview />
        <html.div style={styles.copy}>
          <html.strong style={[controlStyles.boldText, styles.heading]}>{copy.heading}</html.strong>
          <html.span style={styles.detail}>{copy.detail}</html.span>
        </html.div>
        {stacked ? dismiss : cta}
        {stacked ? cta : dismiss}
      </html.div>
      <RsdInstallHint shown={banner.hintOpen && banner.mode !== 'oneTap'} mode={banner.mode} />
    </>
  );
}

function InstallPreview() {
  const dark = useDrawingAppearance() === 'dark';
  return (
    <html.div aria-hidden style={styles.preview}>
      <html.div
        style={[styles.previewTile, dark ? styles.previewTileDark : styles.previewTileLight]}
      >
        <html.img
          src={INSTALL_PREVIEW_ICON_SRC}
          alt=""
          width={PREVIEW_ICON_PX}
          height={PREVIEW_ICON_PX}
          style={styles.previewImage}
        />
      </html.div>
      <html.span style={[controlStyles.semiboldText, styles.previewLabel]}>
        {APP_HOME_SCREEN_NAME}
      </html.span>
    </html.div>
  );
}

function InstallCta({ banner, stacked }: { banner: InstallBanner; stacked: boolean }) {
  const reduceMotion = useReduceMotion();
  const oneTap = banner.mode === 'oneTap';
  const expanded = !oneTap && banner.hintOpen;
  return (
    <RsdPressable
      type="button"
      aria-expanded={oneTap ? undefined : banner.hintOpen}
      aria-controls={oneTap ? undefined : INSTALL_HINT_ID}
      disabled={banner.busy}
      aria-disabled={banner.busy}
      style={[
        controlStyles.boldText,
        styles.cta,
        stacked && styles.ctaStacked,
        banner.busy && styles.ctaDisabled,
      ]}
      onClick={() => {
        void banner.primary();
      }}
    >
      {oneTap ? (
        <>
          <RsdIcon
            name="install-homescreen"
            size={CTA_ICON_PX}
            ink={DRAWING_ON_BRAND}
            muted={false}
          />
          <html.span style={styles.ctaLabel}>{INSTALL_BANNER_COPY.install}</html.span>
        </>
      ) : (
        <>
          <html.span style={styles.ctaLabel}>
            {expanded ? INSTALL_BANNER_COPY.hideHint : INSTALL_BANNER_COPY.showHint}
          </html.span>
          <html.span
            aria-hidden
            style={[
              styles.chevron,
              expanded && styles.chevronTurned,
              reduceMotion && styles.chevronStill,
            ]}
          >
            <RsdIcon name="chevron-down" size={CTA_ICON_PX} ink={DRAWING_ON_BRAND} muted={false} />
          </html.span>
        </>
      )}
    </RsdPressable>
  );
}

const layers = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  card: { width: '100%', maxWidth: MAX_WIDTH_PX, minHeight: 0, flexShrink: 1 },
});

const styles = css.create({
  banner: {
    boxSizing: 'border-box',
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    flexShrink: 1,
    overflow: 'auto',
    padding: dimensions.space4,
    backgroundColor: colors.surface,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: brandColors.brand,
    borderRadius: dimensions.radiusLg,
    boxShadow: colors.floatShadow,
  },
  main: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dimensions.space3,
  },
  mainStacked: { flexWrap: 'wrap' },
  preview: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space1,
    width: PREVIEW_COLUMN_PX,
  },
  previewTile: {
    width: PREVIEW_ICON_PX,
    height: PREVIEW_ICON_PX,
    borderRadius: dimensions.radiusMd,
    overflow: 'hidden',
  },
  previewTileLight: { boxShadow: PREVIEW_LIGHT_SHADOW },
  previewTileDark: { boxShadow: colors.floatShadow },
  previewImage: { display: 'block', width: PREVIEW_ICON_PX, height: PREVIEW_ICON_PX },
  previewLabel: {
    maxWidth: PREVIEW_COLUMN_PX,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeXs,
    lineHeight: PREVIEW_LABEL_LINE_HEIGHT,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  copy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingTop: dimensions.space1,
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space1,
    textAlign: 'left',
    lineHeight: COPY_LINE_HEIGHT,
  },
  heading: {
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
    lineHeight: COPY_LINE_HEIGHT,
  },
  detail: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: COPY_LINE_HEIGHT,
  },
  cta: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space1,
    height: CTA_HEIGHT_PX,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space3,
    borderWidth: 0,
    borderRadius: dimensions.radiusPill,
    backgroundColor: {
      default: colors.brandSolid,
      '@media (hover: hover)': { default: colors.brandSolid, ':hover': colors.brandSolidHover },
    },
    color: brandColors.onBrand,
    fontSize: dimensions.fontSizeMd,
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': `scale(${CTA_PRESS_SCALE})` },
    transitionProperty: 'transform, background-color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: motion.easeGlide,
  },
  ctaStacked: { flexBasis: '100%', marginTop: dimensions.space1 },
  ctaDisabled: { opacity: dimensions.disabledOpacity, cursor: 'default', transform: 'scale(1)' },
  ctaLabel: { color: brandColors.onBrand },
  chevron: {
    display: 'flex',
    transform: 'rotate(0deg)',
    transitionProperty: 'transform',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: motion.easeGlide,
  },
  chevronTurned: { transform: CHEVRON_TURNED },
  chevronStill: { transitionDuration: '0s' },
  dismiss: {
    flexShrink: 0,
    marginTop: -DISMISS_OUTSET_PX,
    marginRight: -DISMISS_OUTSET_PX,
  },
});
