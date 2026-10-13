import { css, html } from 'react-strict-dom';
import { colors, dimensions, brandColors, fonts } from './tokens.css';
import { TOUCH_TARGET } from '../drawing/theme';
import { RsdIcon } from './RsdIcon';
import type { NativeIconName } from './icons.generated';

// Icon buttons size their border box, so the touch target is their whole outer
// size on every renderer (React Strict DOM defaults to content-box, as the web does). Edge
// controls take their size from Button Size (settings/buttonSize.ts); every other icon button
// keeps the normal touch target.
const SELECTION_BORDER_WIDTH_PX = 2;
// The shipping Actions Panel pads its icon by a sixth of the face.
const ICON_PADDING_SHARE = 6;

function iconPadding(size: number) {
  return Math.floor(size / ICON_PADDING_SHARE);
}

function iconSize(size: number) {
  return size - 2 * (iconPadding(size) + SELECTION_BORDER_WIDTH_PX);
}

// The square face of an icon control of this outer size.
export function iconFrame(size: number) {
  return styles.iconBox(size, iconPadding(size));
}

export const styles = css.create({
  themeRoot: {
    fontFamily: fonts.family,
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  screen: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    padding: dimensions.space4,
    gap: dimensions.space3,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
  },
  fullBleed: { padding: 0, gap: 0 },
  // Headings and strong text: RSD's own bold would make Android swap in a system face.
  boldText: { fontFamily: fonts.boldFamily, fontWeight: fonts.boldWeight },
  chevronUp: { transform: 'rotate(-90deg)' },
  chevronDown: { transform: 'rotate(90deg)' },
  chevronLeft: { transform: 'rotate(180deg)' },
  row: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space3 },
  stack: { display: 'flex', flexDirection: 'column', gap: dimensions.space3 },
  toolbar: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space2 },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    padding: dimensions.space4,
    gap: dimensions.space3,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: dimensions.fontSizeMd,
  },
  iconAction: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.floatSurface,
    borderWidth: SELECTION_BORDER_WIDTH_PX,
    borderStyle: 'solid',
    borderColor: colors.floatSurface,
  },
  iconBox: (size: number, padding: number) => ({ width: size, height: size, padding }),
  iconSelected: { backgroundColor: colors.brandWash, borderColor: colors.brandSolid },
  recoveryCard: { display: 'flex', flexDirection: 'column', gap: dimensions.space3 },
  touchTarget: (size: number) => ({ minWidth: size, minHeight: size }),
  action: {
    padding: dimensions.space4,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.paper,
    color: colors.text,
    borderWidth: SELECTION_BORDER_WIDTH_PX,
    borderStyle: 'solid',
    borderColor: colors.paper,
  },
  selected: {
    backgroundColor: colors.brandSolid,
    color: brandColors.onBrand,
    borderColor: colors.brandSolid,
  },
  disabled: { opacity: dimensions.disabledOpacity },
});

type ActionProps = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
} & (
  | { text?: string; icon?: never; ink?: never; size?: never }
  | { icon: NativeIconName; ink?: string; size?: number; text?: never }
) &
  ({ selection?: never; selected?: never } | { selection: 'radio' | 'switch'; selected: boolean });

export function RsdAction({
  label,
  text = label,
  icon,
  ink,
  size = TOUCH_TARGET,
  disabled = false,
  selection,
  selected,
  onClick,
}: ActionProps) {
  return (
    <html.button
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={label}
      role={selection ?? 'button'}
      aria-checked={selection ? selected : undefined}
      style={
        icon
          ? [
              styles.iconAction,
              iconFrame(size),
              styles.touchTarget(size),
              selected && styles.iconSelected,
              disabled && styles.disabled,
            ]
          : [
              styles.action,
              styles.touchTarget(TOUCH_TARGET),
              selected && styles.selected,
              disabled && styles.disabled,
            ]
      }
      onClick={onClick}
    >
      {icon ? <RsdIcon name={icon} size={iconSize(size)} ink={ink} muted={disabled} /> : text}
    </html.button>
  );
}

// The shipping chevron points where the drawer will move: out along its axis while closed, back
// toward the corner while open.
const CHEVRON_TURNS = {
  row: { closed: null, open: styles.chevronLeft },
  column: { closed: styles.chevronUp, open: styles.chevronDown },
} as const;

export function RsdDrawerToggle({
  axis,
  size,
  open,
  onClick,
}: {
  axis: 'row' | 'column';
  size: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <html.button
      aria-label={open ? 'Collapse controls' : 'Expand controls'}
      aria-expanded={open}
      style={[styles.iconAction, iconFrame(size), styles.touchTarget(size)]}
      onClick={onClick}
    >
      <html.div style={CHEVRON_TURNS[axis][open ? 'open' : 'closed']}>
        <RsdIcon name="chevron-right" size={iconSize(size)} ink={undefined} muted={false} />
      </html.div>
    </html.button>
  );
}
