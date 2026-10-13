import { css, html } from 'react-strict-dom';
import { colors, dimensions, brandColors } from './tokens.css';
import { paintAppearance, paintLabel, type PaintColor } from '../drawing/palette';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DRAWING_THEMES, TOUCH_TARGET, type PaperTheme } from '../drawing/theme';
import { RsdIcon } from './RsdIcon';
import type { NativeIconName } from './icons.generated';

// Icon buttons and swatches size their border box, so the touch target is their whole outer
// size on every renderer (React Strict DOM defaults to content-box, as the web does).
const SELECTION_BORDER_WIDTH_PX = 2;
// The shipping Actions Panel pads its icon by a sixth of the face; this is that share of 52pt.
const ICON_PADDING_PX = 8;
const ICON_SIZE_PX = TOUCH_TARGET - 2 * (ICON_PADDING_PX + SELECTION_BORDER_WIDTH_PX);
// The shipping Selection Ring: a 4px ring in the swatch's color around a seam of the bar surface.
const SWATCH_RING_WIDTH_PX = 4;
const SWATCH_RING_GAP_PX = 3;
const SWATCH_DISC_PX = TOUCH_TARGET - 2 * SWATCH_RING_WIDTH_PX;
const SELECTED_SWATCH_DISC_PX = SWATCH_DISC_PX - 2 * SWATCH_RING_GAP_PX;
// Below this contrast against the bar surface a text-free swatch (white custom paint on the
// light bar) disappears, so it gains an outline and a text-colored selection ring.
const SWATCH_MIN_CONTRAST = 1.5;
const SWATCH_OUTLINE_PX = 1;
// The palette bar pads each end by one gap and spaces its swatches a gap apart.
const PALETTE_GAP_PX = 8;

// How many swatches, More colors among them, fit along a bar of this length.
export function paletteSlots(length: number) {
  return Math.max(0, Math.floor((length - PALETTE_GAP_PX) / (TOUCH_TARGET + PALETTE_GAP_PX)));
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function swatchEdge(hex: string, theme: PaperTheme) {
  const { surface, text } = DRAWING_THEMES[theme];
  const [light, dark] = [relativeLuminance(hex), relativeLuminance(surface)].sort((a, b) => b - a);
  const faint = (light + 0.05) / (dark + 0.05) < SWATCH_MIN_CONTRAST;
  return { ring: faint ? text : hex, outline: faint ? text : null };
}

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
  fullBleed: { padding: 0, gap: 0 },
  paletteBar: {
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
    alignItems: 'center',
    padding: PALETTE_GAP_PX,
    gap: PALETTE_GAP_PX,
  },
  paletteSwatches: {
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: PALETTE_GAP_PX,
  },
  column: { flexDirection: 'column' },
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
    boxSizing: 'border-box',
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
  swatchOutline: (borderColor: string) => ({
    borderWidth: SWATCH_OUTLINE_PX,
    borderStyle: 'solid',
    borderColor,
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
  const theme = useDrawingAppearance();
  const appearance = paintAppearance(color, theme);
  const edge = swatchEdge(appearance.hex, theme);
  const disc = selected ? SELECTED_SWATCH_DISC_PX : SWATCH_DISC_PX;
  return (
    <html.button
      role="radio"
      aria-label={paintLabel(color)}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch(selected ? edge.ring : 'transparent', TOUCH_TARGET / 2),
        styles.touchTarget(TOUCH_TARGET),
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      <html.div
        aria-hidden
        style={[
          styles.swatchDisc(appearance.hex, disc, disc / 2),
          edge.outline !== null && styles.swatchOutline(edge.outline),
        ]}
      />
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

// The shipping chevron points where the drawer will move: out along its axis while closed, back
// toward the corner while open.
const CHEVRON_TURNS = {
  row: { closed: null, open: styles.chevronLeft },
  column: { closed: styles.chevronUp, open: styles.chevronDown },
} as const;

export function RsdDrawerToggle({
  axis,
  open,
  onClick,
}: {
  axis: 'row' | 'column';
  open: boolean;
  onClick: () => void;
}) {
  return (
    <html.button
      aria-label={open ? 'Collapse controls' : 'Expand controls'}
      aria-expanded={open}
      style={[styles.iconAction, styles.touchTarget(TOUCH_TARGET)]}
      onClick={onClick}
    >
      <html.div style={CHEVRON_TURNS[axis][open ? 'open' : 'closed']}>
        <RsdIcon name="chevron-right" size={ICON_SIZE_PX} ink={undefined} muted={false} />
      </html.div>
    </html.button>
  );
}
