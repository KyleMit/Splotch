import { css, html } from 'react-strict-dom';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { paintAppearance, paintLabel, type PaintColor } from '../drawing/palette';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import {
  MORE_COLORS_POP_SCALE,
  SELECTION_RING_GAP_PX,
  SELECTION_RING_SEAM_PX,
  SELECTION_RING_WIDTH_PX,
  selectionRingColor,
} from './paletteGeometry';
import { colors, dimensions, motion } from './tokens.css';

// Shipping presses a swatch down to this scale. Local because the StyleX web compile resolves only
// local constants inside css.create; rsd-native-drawing-frame.test.mjs holds it to shipping.
export const SWATCH_PRESS_SCALE = 0.9;

// The shipping ColorSwatch: a raised disc of paint (or, for More colors, of the bar surface)
// that a press sinks. Selected, a band of the bar surface steps in from the edge and a ring a
// shade off the paint sits outside it, over a one-pixel seam of the surface. Both are drawn as
// boxes rather than one stacked box-shadow so each layer takes its color the same way on every
// renderer.
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
  disabled: { opacity: dimensions.disabledOpacity },
});

// The seam is the surface the swatch sits on: the palette bar's, or a flyout card's.
export function SelectionRing({
  size,
  color,
  surface = 'surface',
}: {
  size: number;
  color: string;
  surface?: 'surface' | 'floatSurface';
}) {
  const ring = size + 2 * SELECTION_RING_WIDTH_PX;
  const seam = size + 2 * SELECTION_RING_SEAM_PX;
  return (
    <>
      <html.div
        aria-hidden
        data-selection-ring={color}
        style={[
          styles.ring(-SELECTION_RING_WIDTH_PX, ring, SELECTION_RING_WIDTH_PX),
          styles.ringColor(color),
        ]}
      />
      <html.div
        aria-hidden
        style={[
          styles.ring(-SELECTION_RING_SEAM_PX, seam, SELECTION_RING_SEAM_PX),
          surface === 'surface' ? styles.seamColor : styles.floatSeamColor,
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
  onClick,
}: {
  color: PaintColor;
  size: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { hex } = paintAppearance(color, useDrawingAppearance());
  const inner = size - 2 * SELECTION_RING_GAP_PX;
  return (
    <RsdPressable
      type="button"
      role="radio"
      aria-label={paintLabel(color)}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.swatch,
        styles.disc(size),
        selected ? styles.surface : styles.fill(hex),
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      {selected ? (
        <>
          <html.div aria-hidden style={[styles.disc(inner), styles.fill(hex)]} />
          <SelectionRing size={size} color={selectionRingColor(hex)} />
        </>
      ) : null}
    </RsdPressable>
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
  const icon = (size - 2 * SELECTION_RING_GAP_PX) / MORE_COLORS_POP_SCALE;
  return (
    <RsdPressable
      type="button"
      aria-label="More colors"
      aria-disabled={disabled}
      disabled={disabled}
      style={[styles.swatch, styles.disc(size), styles.surface, disabled && styles.disabled]}
      onClick={onClick}
    >
      <RsdIcon name="more-colors" size={icon} ink={undefined} muted={disabled} />
    </RsdPressable>
  );
}
