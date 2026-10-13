import { css, html } from 'react-strict-dom';
import { colors, dimensions, brandColors } from './tokens.css';
import { paintAppearance, paintLabel, type PaintColor } from '../drawing/palette';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { TOUCH_TARGET } from '../drawing/theme';
import { RsdIcon } from './RsdIcon';
import type { NativeIconName } from './icons.generated';

const SELECTION_BORDER_WIDTH_PX = 2;
// The shipping Actions Panel pads its icon by a sixth of the face; this is that share of 52pt.
const ICON_PADDING_PX = 8;
const ICON_SIZE_PX = TOUCH_TARGET - 2 * (ICON_PADDING_PX + SELECTION_BORDER_WIDTH_PX);
// The shipping Selection Ring: a 4px ring in the swatch's color around a seam of the bar surface.
const SWATCH_RING_WIDTH_PX = 4;
const SWATCH_RING_GAP_PX = 3;
const SWATCH_DISC_PX = TOUCH_TARGET - 2 * SWATCH_RING_WIDTH_PX;
const SELECTED_SWATCH_DISC_PX = SWATCH_DISC_PX - 2 * SWATCH_RING_GAP_PX;

export const styles = css.create({
  themeRoot: {
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
    fontSize: dimensions.fontSizeMd,
  },
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: dimensions.touchTarget,
    height: dimensions.touchTarget,
    padding: ICON_PADDING_PX,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.floatSurface,
    borderWidth: SELECTION_BORDER_WIDTH_PX,
    borderStyle: 'solid',
    borderColor: colors.floatSurface,
  },
  iconSelected: { backgroundColor: colors.brandWash, borderColor: colors.brandSolid },
  swatch: (ring: string, radius: number) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: dimensions.touchTarget,
    height: dimensions.touchTarget,
    padding: 0,
    borderRadius: radius,
    borderWidth: SWATCH_RING_WIDTH_PX,
    borderStyle: 'solid',
    borderColor: ring,
    backgroundColor: 'transparent',
  }),
  swatchDisc: (backgroundColor: string, size: number, radius: number) => ({
    width: size,
    height: size,
    borderRadius: radius,
    backgroundColor,
  }),
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
  | { text?: string; icon?: never; ink?: never }
  | { icon: NativeIconName; ink?: string; text?: never }
) &
  ({ selection?: never; selected?: never } | { selection: 'radio' | 'switch'; selected: boolean });

export function RsdAction({
  label,
  text = label,
  icon,
  ink,
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
              styles.touchTarget(TOUCH_TARGET),
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
      {icon ? <RsdIcon name={icon} size={ICON_SIZE_PX} ink={ink} muted={disabled} /> : text}
    </html.button>
  );
}

export function RsdPaintAction({
  color,
  selected,
  disabled,
  onClick,
}: {
  color: PaintColor;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const appearance = paintAppearance(color, useDrawingAppearance());
  const disc = selected ? SELECTED_SWATCH_DISC_PX : SWATCH_DISC_PX;
  return (
    <html.button
      role="radio"
      aria-label={paintLabel(color)}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch(selected ? appearance.hex : 'transparent', TOUCH_TARGET / 2),
        styles.touchTarget(TOUCH_TARGET),
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      <html.div aria-hidden style={styles.swatchDisc(appearance.hex, disc, disc / 2)} />
    </html.button>
  );
}

export function RsdMoreColorsSwatch({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <html.button
      aria-label="More colors"
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch('transparent', TOUCH_TARGET / 2),
        styles.touchTarget(TOUCH_TARGET),
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      <RsdIcon name="more-colors" size={SWATCH_DISC_PX} ink={undefined} muted={disabled} />
    </html.button>
  );
}
