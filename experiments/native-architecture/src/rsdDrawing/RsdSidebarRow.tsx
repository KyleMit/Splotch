import { Svg, Path, Circle } from '../platform/svg';
import { paletteHex } from '../drawing/palette';
import type { ReleaseHue } from '../../../../web/src/lib/releaseHues';
import { blobPath } from './blob';
import { css, html } from 'react-strict-dom';
import { brandColors, colors, dimensions, fonts } from './tokens.css';
import { RsdActivityDot } from './RsdActivityDot';
import { RsdSectionIcon, type SectionIconName } from './RsdSectionIcon';
import { styles as controlStyles } from './controls';
import { sidebarRowFade } from './sidebarRowFade';
import { DRAWING_SCALE } from '../drawing/theme';

// The shipping SidebarToc.svelte row; rsd-native-settings-rows.test.mjs reads each from that
// source. Tighter vertically than a hub row: the icon carries most of the row height.
const ROW_MIN_PX = 44;
const ROW_PADDING_Y_PX = 9;
const ICON_PX = 34;
const LINE_HEIGHT = 1.3;
const HUE_PX = 10;
const ACTIVE_HUE_PX = 18;
const HIGHLIGHT_PX = 10;
const HIGHLIGHT_LEFT_PX = -4;
const HIGHLIGHT_RIGHT_PX = -6;
const HIGHLIGHT_BOTTOM_PX = 1;
const META_GAP_PX = 2;
// The current row thickens its segment of the track without moving its label: the extra width
// comes back out of the row's leading padding.
const SEGMENT_PX = 3;
const ACTIVE_PADDING_LEFT_PX = DRAWING_SCALE.space4 - SEGMENT_PX + DRAWING_SCALE.borderWidth;

const styles = css.create({
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: dimensions.space3,
    minHeight: ROW_MIN_PX,
    paddingTop: ROW_PADDING_Y_PX,
    paddingBottom: ROW_PADDING_Y_PX,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    borderWidth: 0,
    borderStyle: 'solid',
    borderLeftWidth: dimensions.borderWidth,
    borderLeftColor: colors.border,
    // The leading edge belongs to the track, so it never rounds.
    borderTopRightRadius: dimensions.radiusSm,
    borderBottomRightRadius: dimensions.radiusSm,
    // Under (hover: hover), which React Native never matches, as a touch WebView never does.
    backgroundColor: {
      default: 'transparent',
      '@media (hover: hover)': { default: 'transparent', ':hover': colors.surfaceHover },
    },
    color: {
      default: colors.textSoft,
      '@media (hover: hover)': { default: colors.textSoft, ':hover': colors.textStrong },
    },
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    lineHeight: LINE_HEIGHT,
    textAlign: 'left',
    cursor: 'pointer',
  },
  // A reading position, not a selection: a soft wash and a thickened segment rather than a
  // filled pill. --brand-text on --brand-wash clears AA; --brand carries the textless segment.
  active: {
    borderLeftColor: brandColors.brand,
    borderLeftWidth: SEGMENT_PX,
    backgroundColor: colors.brandWash,
    color: colors.brandText,
  },
  // A dynamic style: StyleX evaluates only this module's own constants statically.
  activePadding: (paddingLeft: number) => ({ paddingLeft }),
  icon: { position: 'relative', width: ICON_PX, height: ICON_PX, flexShrink: 0 },
  label: { flexShrink: 1 },
  text: { display: 'flex', flexDirection: 'column', minWidth: 0, flexShrink: 1 },
  meta: { marginTop: META_GAP_PX, fontSize: dimensions.fontSizeXs, color: colors.textSoft },
  huedActive: { backgroundColor: 'transparent' },
  hueFrame: {
    width: ACTIVE_HUE_PX,
    height: ACTIVE_HUE_PX,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  highlighted: { position: 'relative', color: colors.textStrong },
  highlight: {
    position: 'absolute',
    left: HIGHLIGHT_LEFT_PX,
    right: HIGHLIGHT_RIGHT_PX,
    bottom: HIGHLIGHT_BOTTOM_PX,
    height: HIGHLIGHT_PX,
    borderRadius: dimensions.radiusPill,
    backgroundColor: colors.highlighter,
    transform: 'rotate(-1.5deg)',
  },
  front: { position: 'relative' },
});

// SidebarToc.svelte's button row, marked as the reading position while its section is.
type SidebarRowProps = { label: string; meta?: string; active: boolean; onSelect: () => void } & (
  | { icon: SectionIconName; unseen: boolean; hue?: never }
  | { icon?: never; unseen?: never; hue?: ReleaseHue }
);

export function RsdSidebarRow({
  icon,
  label,
  meta,
  hue,
  unseen,
  active,
  onSelect,
}: SidebarRowProps) {
  const text = (
    <html.span style={[styles.label, active && !!hue && controlStyles.boldText, styles.front]}>
      {label}
    </html.span>
  );
  return (
    <html.button
      aria-label={unseen ? `${label}, new` : label}
      aria-current={active ? 'location' : undefined}
      data-testid="sidebar-row"
      style={[
        styles.row,
        sidebarRowFade.row,
        active && styles.active,
        active && !!hue && styles.huedActive,
        active && styles.activePadding(ACTIVE_PADDING_LEFT_PX),
      ]}
      onClick={onSelect}
    >
      {icon ? (
        <html.div style={styles.icon}>
          <RsdSectionIcon icon={icon} size={ICON_PX} ink={undefined} />
          <RsdActivityDot unseen={unseen} surface="surface" />
        </html.div>
      ) : null}
      {hue ? (
        <html.div aria-hidden style={styles.hueFrame}>
          <Svg width={active ? ACTIVE_HUE_PX : HUE_PX} height={active ? ACTIVE_HUE_PX : HUE_PX}>
            {active ? (
              <Path
                d={blobPath('radiusBlob1', ACTIVE_HUE_PX, ACTIVE_HUE_PX)}
                fill={paletteHex(hue)}
              />
            ) : (
              <Circle cx={HUE_PX / 2} cy={HUE_PX / 2} r={HUE_PX / 2} fill={paletteHex(hue)} />
            )}
          </Svg>
        </html.div>
      ) : null}
      {hue || meta ? (
        <html.div style={styles.text}>
          <html.div style={[active && !!hue && styles.highlighted]}>
            {active && hue ? <html.div aria-hidden style={styles.highlight} /> : null}
            {text}
          </html.div>
          {meta ? <html.span style={styles.meta}>{meta}</html.span> : null}
        </html.div>
      ) : (
        text
      )}
    </html.button>
  );
}
