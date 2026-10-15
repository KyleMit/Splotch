import { css, html } from 'react-strict-dom';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import {
  CUSTOM_COLOR_LABEL,
  paintAppearance,
  paintLabel,
  type CustomPaintSelection,
  type PaintColor,
} from '../drawing/palette';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import { RsdSwatchBloom } from './swatchBloomSurface';
import {
  MORE_COLORS_POP_SCALE,
  SELECTION_RING_GAP_PX,
  SELECTION_RING_SEAM_PX,
  SELECTION_RING_WIDTH_PX,
  SELECTION_SEAM_OVERLAP_PX,
  selectionRingColor,
} from './paletteGeometry';
import { colors, dimensions, motion } from './tokens.css';
import { useBareToolbar } from './toolbarSkin';

// Shipping presses a swatch down to this scale. Local because the StyleX web compile resolves only
// local constants inside css.create; rsd-native-drawing-frame.test.mjs holds it to shipping.
export const SWATCH_PRESS_SCALE = 0.9;

// The shipping ColorSwatch: a raised disc of paint (or, for More colors, of the bar surface)
// that a press sinks. Selected, a band of the bar surface steps in from the edge and a ring a
// shade off the paint sits outside it, over a one-pixel seam of the surface. Both are drawn as
// boxes rather than one stacked box-shadow so each layer takes its color the same way on every
// renderer: the seam underneath, the ring's visible width over it.
const styles = css.create({
  swatch: {
    boxSizing: 'border-box',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderWidth: 0,
    flexShrink: 0,
    boxShadow: colors.floatShadow,
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': `scale(${SWATCH_PRESS_SCALE})` },
    transitionProperty: 'transform',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  disc: (size: number) => ({ width: size, height: size, borderRadius: size / 2 }),
  fill: (backgroundColor: string) => ({ backgroundColor }),
  surface: { backgroundColor: colors.surface },
  // The flat style's palette sits on the paper itself, so its bands and seams are paper.
  paper: { backgroundColor: colors.paper },
  bare: { backgroundColor: 'transparent', boxShadow: 'none' },
  ring: (inset: number, size: number, borderWidth: number) => ({
    boxSizing: 'border-box',
    position: 'absolute',
    top: inset,
    left: inset,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth,
    borderStyle: 'solid',
    pointerEvents: 'none',
  }),
  ringColor: (borderColor: string) => ({ borderColor }),
  seamColor: { borderColor: colors.surface },
  floatSeamColor: { borderColor: colors.floatSurface },
  paperSeamColor: { borderColor: colors.paper },
  disabled: { opacity: dimensions.disabledOpacity },
});

// The seam is the surface the swatch sits on: the palette bar's, a flyout card's, or the paper a
// flat palette or menu is printed on.
export type RingSurface = 'surface' | 'floatSurface' | 'paper';

const SEAMS = {
  surface: styles.seamColor,
  floatSurface: styles.floatSeamColor,
  paper: styles.paperSeamColor,
} satisfies Record<RingSurface, unknown>;

export function SelectionRing({
  size,
  color,
  surface = 'surface',
}: {
  size: number;
  color: string;
  surface?: RingSurface;
}) {
  const seamReach = SELECTION_RING_SEAM_PX + SELECTION_SEAM_OVERLAP_PX;
  return (
    <>
      <html.div
        aria-hidden
        style={[
          styles.ring(
            -seamReach,
            size + 2 * seamReach,
            SELECTION_RING_SEAM_PX + 2 * SELECTION_SEAM_OVERLAP_PX
          ),
          SEAMS[surface],
        ]}
      />
      <html.div
        aria-hidden
        style={[
          styles.ring(
            -SELECTION_RING_WIDTH_PX,
            size + 2 * SELECTION_RING_WIDTH_PX,
            SELECTION_RING_WIDTH_PX - SELECTION_RING_SEAM_PX
          ),
          styles.ringColor(color),
        ]}
      />
    </>
  );
}

export function RsdPaintAction({
  color,
  size,
  selected,
  disabled,
  bloom,
  onClick,
}: {
  color: PaintColor;
  size: number;
  selected: boolean;
  disabled: boolean;
  bloom: { reduced: boolean } | null;
  onClick: () => void;
}) {
  const theme = useDrawingAppearance();
  const { hex } = paintAppearance(color, theme);
  const bare = useBareToolbar();
  const inner = size - 2 * SELECTION_RING_GAP_PX;
  return (
    <RsdPressable
      type="button"
      aria-label={paintLabel(color, theme)}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch,
        styles.disc(size),
        selected ? (bare ? styles.paper : styles.surface) : styles.fill(hex),
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      {bloom ? (
        <RsdSwatchBloom size={size} color={selectionRingColor(hex)} reduced={bloom.reduced} />
      ) : null}
      {selected ? (
        <>
          <html.div aria-hidden style={[styles.disc(inner), styles.fill(hex)]} />
          <SelectionRing
            size={size}
            color={selectionRingColor(hex)}
            surface={bare ? 'paper' : 'surface'}
          />
        </>
      ) : null}
    </RsdPressable>
  );
}

export function RsdMoreColorsSwatch({
  size,
  custom,
  disabled,
  onClick,
}: {
  size: number;
  custom: CustomPaintSelection;
  disabled: boolean;
  onClick: () => void;
}) {
  const icon = (size - 2 * SELECTION_RING_GAP_PX) / (custom?.color ? 1 : MORE_COLORS_POP_SCALE);
  const bare = useBareToolbar();
  return (
    <RsdPressable
      type="button"
      aria-label={CUSTOM_COLOR_LABEL}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch,
        styles.disc(size),
        bare ? styles.bare : styles.surface,
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      <RsdIcon name="more-colors" size={icon} ink={undefined} muted={disabled} />
      {custom?.color ? (
        <SelectionRing size={size} color={custom.color} surface={bare ? 'paper' : 'surface'} />
      ) : null}
    </RsdPressable>
  );
}
