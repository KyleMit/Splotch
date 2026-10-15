import { css, html } from 'react-strict-dom';
import { brandColors, colors, dimensions, fonts } from './tokens.css';
import { RsdActivityDot } from './RsdActivityDot';
import { RsdSectionIcon, type SectionIconName } from './RsdSectionIcon';
import { sidebarRowFade } from './sidebarRowFade';
import { DRAWING_SCALE } from '../drawing/theme';

// The shipping SidebarToc.svelte row; rsd-native-settings-rows.test.mjs reads each from that
// source. Tighter vertically than a hub row: the icon carries most of the row height.
const ROW_MIN_PX = 44;
const ROW_PADDING_Y_PX = 9;
const ICON_PX = 34;
const LINE_HEIGHT = 1.3;
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
});

// SidebarToc.svelte's button row, marked as the reading position while its section is.
type SidebarRowProps = { label: string; active: boolean; onSelect: () => void } & (
  { icon: SectionIconName; unseen: boolean } | { icon?: never; unseen?: never }
);

export function RsdSidebarRow({ icon, label, unseen, active, onSelect }: SidebarRowProps) {
  return (
    <html.button
      aria-label={unseen ? `${label}, new` : label}
      aria-current={active ? 'location' : undefined}
      data-testid="sidebar-row"
      style={[
        styles.row,
        sidebarRowFade.row,
        active && styles.active,
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
      <html.span style={styles.label}>{label}</html.span>
    </html.button>
  );
}
