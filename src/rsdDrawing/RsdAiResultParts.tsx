import { css, html } from 'react-strict-dom';
import { autoSaveFooter as shippingAutoSaveFooter } from '../lib/ai/autoSaveCopy';
import { AI_LOADING_SUBTITLE, AI_LOADING_TITLE } from '../lib/ai/loadingCopy';
import { scale } from '../lib/design/tokens';
import { AI_AUTO_SAVE_COPY, AI_RESULT_COPY } from '../ai/aiResultCopy';
import type { AiAutoSave } from '../ai/aiAutoSave';
import { AI_RESULT_METRICS } from '../ai/aiResultGeometry';
import { DRAWING_ON_BRAND } from '../drawing/theme';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import { brandColors, colors, dimensions, fixedColors, fonts, motion } from './tokens.css';
import { styles as controlStyles } from './controls';

// AiResultFooter.svelte, AiImageResult.svelte and AiResultDisclosure.svelte literals;
// native-ai-flow-geometry.test.mjs reads them back.
const RESULT_PILL_PADDING_PX = 22;
const DOWNLOAD_ICON_PX = 18;
const DOWNLOAD_GAP_PX = 8;
const DOWNLOAD_PRESSED_SCALE = 0.95;
// Shipping mixes --brand 40% into transparent under the Download button.
export const DOWNLOAD_SHADOW = '0 4px 12px rgba(171, 113, 225, 0.4)';
const DISCLOSURE_PADDING_PX = 14;
const REPORT_FLAG_ICON_PX = 14;
const REPORT_FLAG_PRESSED_SCALE = 0.95;

// The caption under the dial while the picture is made.
export function RsdAiLoadingCaption() {
  return (
    <html.div style={styles.caption(AI_RESULT_METRICS.loadingCaptionHeight)}>
      <html.p style={[controlStyles.semiboldText, styles.captionTitle]}>{AI_LOADING_TITLE}</html.p>
      <html.p style={[styles.medium, styles.captionSubtitle]}>{AI_LOADING_SUBTITLE}</html.p>
    </html.div>
  );
}

// The X and the scrim tuck a waiting picture away too, but both read as cancel; half a minute is
// long enough that the way out is written down. Shaped like the Download button that later stands
// in the same place, so the two read as one slot.
export function RsdAiKeepDrawing({ onPress }: { onPress: () => void }) {
  return (
    <RsdPressable
      type="button"
      style={[
        controlStyles.boldText,
        styles.pill(AI_RESULT_METRICS.keepDrawingHeight, RESULT_PILL_PADDING_PX),
        styles.wash,
      ]}
      onClick={onPress}
    >
      <html.span>{AI_RESULT_COPY.keepDrawing}</html.span>
    </RsdPressable>
  );
}

// The finished picture's footer: Download, then any report outcome under it.
export function RsdAiDownload({ onPress }: { onPress: () => void }) {
  return (
    <RsdPressable
      type="button"
      style={[
        controlStyles.boldText,
        styles.pill(AI_RESULT_METRICS.keepDrawingHeight, RESULT_PILL_PADDING_PX),
        styles.download(DOWNLOAD_GAP_PX, DOWNLOAD_SHADOW, `scale(${DOWNLOAD_PRESSED_SCALE})`),
      ]}
      onClick={onPress}
    >
      <RsdIcon name="download" size={DOWNLOAD_ICON_PX} ink={DRAWING_ON_BRAND} muted={false} />
      <html.span>{AI_RESULT_COPY.download}</html.span>
    </RsdPressable>
  );
}

// shipping's autoSaveFooter: nothing while the save runs, the saved caption once it landed, and
// the Download button with no auto-save or after one that did not land.
export function aiAutoSaveFooter(
  autoSave: AiAutoSave | null
): { kind: 'saved'; caption: string } | { kind: 'downloadButton' } | null {
  if (!autoSave) return { kind: 'downloadButton' };
  if (autoSave.status === 'saving') return null;
  if (autoSave.status === 'chosenFolder') return shippingAutoSaveFooter(autoSave);
  if (autoSave.status === 'photos' || autoSave.status === 'downloads')
    return { kind: 'saved', caption: AI_AUTO_SAVE_COPY[autoSave.status] };
  return { kind: 'downloadButton' };
}

export function RsdAiSavedCaption({ caption }: { caption: string }) {
  return <html.p style={[controlStyles.boldText, styles.saved]}>{`✓ ${caption}`}</html.p>;
}

// The fine print hanging under the card: the picture is AI-made, and grown-ups can report it.
// After a server failure the strip offers only Report a problem, hanging under the card's right
// edge as shipping's .problem strip does.
export function RsdAiDisclosure({
  kind = 'picture',
  disabled,
  onReport,
}: {
  kind?: 'picture' | 'problem';
  disabled: boolean;
  onReport: () => void;
}) {
  const picture = kind === 'picture';
  const m = AI_RESULT_METRICS;
  return (
    <html.div
      style={[controlStyles.semiboldText, styles.strip(m.reportStripHeight, DISCLOSURE_PADDING_PX)]}
    >
      {picture ? (
        <>
          <html.span style={styles.disclosure}>{AI_RESULT_COPY.disclosure}</html.span>
          <html.span aria-hidden style={styles.separator}>
            ·
          </html.span>
        </>
      ) : null}
      <RsdPressable
        type="button"
        aria-label={picture ? AI_RESULT_COPY.reportPictureLabel : AI_RESULT_COPY.reportProblem}
        disabled={disabled}
        aria-disabled={disabled}
        style={[
          styles.flag(m.reportStripTap, REPORT_FLAG_ICON_PX, `scale(${REPORT_FLAG_PRESSED_SCALE})`),
          disabled && styles.flagDisabled,
        ]}
        onClick={onReport}
      >
        <FlagIcon disabled={disabled} />
        <html.span>
          {picture ? AI_RESULT_COPY.reportPicture : AI_RESULT_COPY.reportProblem}
        </html.span>
      </RsdPressable>
    </html.div>
  );
}

// The scrim inks stay put in both themes, so the flag reads them as plain colors for its markup.
function FlagIcon({ disabled }: { disabled: boolean }) {
  const ink = disabled ? scale.scrimInkSoft : scale.scrimInkDanger;
  return <RsdIcon name="flag" size={REPORT_FLAG_ICON_PX} ink={ink} muted={false} />;
}

const styles = css.create({
  medium: { fontFamily: fonts.mediumFamily, fontWeight: fonts.mediumWeight },
  caption: (minHeight: number) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    minHeight,
    paddingLeft: dimensions.space2,
    paddingRight: dimensions.space2,
    textAlign: 'center',
  }),
  saved: { margin: 0, color: colors.successText, fontSize: dimensions.fontSizeSm },
  captionTitle: { margin: 0, color: colors.text, fontSize: dimensions.fontSizeLg },
  captionSubtitle: { margin: 0, color: colors.textSoft, fontSize: dimensions.fontSizeSm },
  pill: (height: number, padding: number) => ({
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: height,
    minHeight: height,
    paddingLeft: padding,
    paddingRight: padding,
    borderWidth: 0,
    borderRadius: dimensions.radiusPill,
    fontSize: dimensions.fontSizeSm,
    // A large system text size wraps the label; its lines stay centred in the pill.
    textAlign: 'center',
    cursor: 'pointer',
  }),
  wash: {
    backgroundColor: {
      default: colors.brandWash,
      '@media (hover: hover)': { default: colors.brandWash, ':hover': colors.brandWashHover },
    },
    color: colors.brandText,
    transform: { default: 'scale(1)', ':active': 'scale(0.96)' },
    transitionProperty: 'transform, background-color',
    transitionDuration: motion.durationFast,
  },
  download: (gap: number, shadow: string, pressed: string) => ({
    gap,
    backgroundColor: {
      default: colors.brandSolid,
      '@media (hover: hover)': { default: colors.brandSolid, ':hover': colors.brandSolidHover },
    },
    color: brandColors.onBrand,
    boxShadow: shadow,
    transform: { default: 'scale(1)', ':active': pressed },
    transitionProperty: 'transform, background-color',
    transitionDuration: motion.durationFast,
  }),
  strip: (height: number, padding: number) => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space2,
    // At least one line; a large system text size wraps the disclosure, and the strip grows.
    minHeight: height,
    paddingLeft: padding,
    paddingRight: padding,
    borderRadius: dimensions.radiusPill,
    backgroundColor: fixedColors.scrimPill,
    color: fixedColors.scrimInk,
    fontSize: dimensions.fontSizeXs,
    whiteSpace: 'nowrap',
  }),
  // The words that wrap when a large system text size outgrows the card; Report stays whole.
  disclosure: { flexShrink: 1 },
  separator: { color: fixedColors.scrimInkSoft },
  flag: (tap: number, icon: number, pressed: string) => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space1,
    flexShrink: 0,
    minWidth: tap,
    height: tap,
    marginTop: (icon - tap) / 2,
    marginBottom: (icon - tap) / 2,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: fixedColors.scrimInkDanger,
    fontSize: dimensions.fontSizeXs,
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': pressed },
  }),
  flagDisabled: { color: fixedColors.scrimInkSoft, cursor: 'default' },
});
