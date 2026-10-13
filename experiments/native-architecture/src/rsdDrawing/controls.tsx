import { css, html } from 'react-strict-dom';
import { colors, dimensions, brandColors } from './tokens.css';
import { paintAppearance, paintLabel, type PaintColor } from '../drawing/palette';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DRAWING_THEMES, TOUCH_TARGET, type PaperTheme } from '../drawing/theme';
import { RsdIcon } from './RsdIcon';
import type { NativeIconName } from './icons.generated';

// Icon buttons and swatches size their border box, so the touch target is their whole outer
// size on every renderer (React Strict DOM defaults to content-box, as the web does). Edge
// controls take their size from Button Size (settings/buttonSize.ts); every other icon button
// keeps the normal touch target.
const SELECTION_BORDER_WIDTH_PX = 2;
// The shipping Actions Panel pads its icon by a sixth of the face.
const ICON_PADDING_SHARE = 6;
// The shipping Selection Ring: a 4px ring in the swatch's color around a seam of the bar surface.
const SWATCH_RING_WIDTH_PX = 4;
const SWATCH_RING_GAP_PX = 3;
// Below this contrast against the bar surface a text-free swatch (white custom paint on the
// light bar) disappears, so it gains an outline and a text-colored selection ring.
const SWATCH_MIN_CONTRAST = 1.5;
const SWATCH_OUTLINE_PX = 1;
// The palette bar pads each end by one gap and spaces its swatches a gap apart.
const PALETTE_GAP_PX = 8;

function iconPadding(size: number) {
  return Math.floor(size / ICON_PADDING_SHARE);
}

function iconSize(size: number) {
  return size - 2 * (iconPadding(size) + SELECTION_BORDER_WIDTH_PX);
}

function swatchDisc(size: number) {
  return size - 2 * SWATCH_RING_WIDTH_PX;
}

// The square face of an icon control of this outer size.
export function iconFrame(size: number) {
  return styles.iconBox(size, iconPadding(size));
}

// How many swatches of this size, More colors among them, fit along a bar of this length.
export function paletteSlots(length: number, size: number) {
  return Math.max(0, Math.floor((length - PALETTE_GAP_PX) / (size + PALETTE_GAP_PX)));
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
    fontFamily: dimensions.fontFamily,
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
    fontFamily: dimensions.fontFamily,
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
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.floatSurface,
    borderWidth: SELECTION_BORDER_WIDTH_PX,
    borderStyle: 'solid',
    borderColor: colors.floatSurface,
  },
  iconBox: (size: number, padding: number) => ({ width: size, height: size, padding }),
  iconSelected: { backgroundColor: colors.brandWash, borderColor: colors.brandSolid },
  swatch: (ring: string, size: number, radius: number) => ({
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
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

export function RsdPaintAction({
  color,
  size,
  selected,
  disabled,
  onClick,
}: {
  color: PaintColor;
  size: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const theme = useDrawingAppearance();
  const appearance = paintAppearance(color, theme);
  const edge = swatchEdge(appearance.hex, theme);
  const disc = swatchDisc(size) - (selected ? 2 * SWATCH_RING_GAP_PX : 0);
  return (
    <html.button
      role="radio"
      aria-label={paintLabel(color)}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch(selected ? edge.ring : 'transparent', size, size / 2),
        styles.touchTarget(size),
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
  size,
  disabled,
  onClick,
}: {
  size: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <html.button
      aria-label="More colors"
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch('transparent', size, size / 2),
        styles.touchTarget(size),
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      <RsdIcon name="more-colors" size={swatchDisc(size)} ink={undefined} muted={disabled} />
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
