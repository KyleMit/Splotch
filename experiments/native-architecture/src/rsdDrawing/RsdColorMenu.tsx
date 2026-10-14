import { css, html } from 'react-strict-dom';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import {
  isCustomColor,
  paintAppearance,
  paintLabel,
  type PaintColor,
  type PaletteLabel,
} from '../drawing/palette';
import { RsdFlyoutMenu } from './RsdFlyoutMenu';
import type { FlyoutScale } from './RsdIconButton';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import { SelectionRing } from './RsdSwatch';
import { COLOR_MENU_SPACING, COLOR_MENU_SWATCH_PX, colorMenuLabels } from './colorMenuLayout';
import {
  MORE_COLORS_POP_SCALE,
  SELECTION_RING_GAP_PX,
  selectionRingColor,
} from './paletteGeometry';
import { colors, motion } from './tokens.css';

// ColorMenu.svelte's press feedback; local for the StyleX web compile, and held to the shipping
// rule by rsd-native-color-control.test.mjs.
export const COLOR_OPTION_PRESS_SCALE = 0.9;

// The shipping .color-option: a flat disc of paint with no shadow of its own, which a press sinks.
// Ringed, a band of the menu's surface steps in from its edge under the Selection Ring.
const styles = css.create({
  option: (size: number) => ({
    boxSizing: 'border-box',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: size / 2,
    padding: 0,
    borderWidth: 0,
  }),
  press: {
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': `scale(${COLOR_OPTION_PRESS_SCALE})` },
    transitionProperty: 'transform',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  fill: (backgroundColor: string) => ({ backgroundColor }),
  surface: { backgroundColor: colors.floatSurface },
  clear: { backgroundColor: 'transparent' },
  row: (gap: number) => ({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap }),
});

const INNER_PX = COLOR_MENU_SWATCH_PX - 2 * SELECTION_RING_GAP_PX;

function PaintOption({
  label,
  ringed,
  disabled,
  onPick,
}: {
  label: PaletteLabel;
  ringed: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const { hex } = paintAppearance(label, useDrawingAppearance());
  return (
    <RsdPressable
      type="button"
      role="radio"
      aria-label={paintLabel(label)}
      aria-checked={ringed}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.option(COLOR_MENU_SWATCH_PX),
        styles.press,
        ringed ? styles.surface : styles.fill(hex),
      ]}
      onClick={onPick}
    >
      {ringed ? (
        <>
          <html.div aria-hidden style={[styles.option(INNER_PX), styles.fill(hex)]} />
          <SelectionRing
            size={COLOR_MENU_SWATCH_PX}
            color={selectionRingColor(hex)}
            surface="floatSurface"
          />
        </>
      ) : null}
    </RsdPressable>
  );
}

// The honeycomb opens the Color Picker. Ringed while a custom paint is loaded, in that paint, with
// the honeycomb popped to fill the band.
function MoreColorsOption({
  custom,
  disabled,
  onCustom,
}: {
  custom: string | null;
  disabled: boolean;
  onCustom: () => void;
}) {
  const icon = INNER_PX / (custom ? 1 : MORE_COLORS_POP_SCALE);
  return (
    <RsdPressable
      type="button"
      aria-label="More colors"
      aria-disabled={disabled}
      disabled={disabled}
      style={[styles.option(COLOR_MENU_SWATCH_PX), styles.press, styles.clear]}
      onClick={onCustom}
    >
      <RsdIcon name="more-colors" size={icon} ink={undefined} muted={disabled} />
      {custom ? (
        <SelectionRing size={COLOR_MENU_SWATCH_PX} color={custom} surface="floatSurface" />
      ) : null}
    </RsdPressable>
  );
}

// The shipping Color Menu: the landscape phone's colors in a row beside the Color Button, as many
// as fit the room to the paper's edge, and the honeycomb that opens the Color Picker.
export function RsdColorMenu({
  areaWidth,
  buttonSize,
  selected,
  erasing,
  disabled,
  onPick,
  onCustom,
  ...scale
}: FlyoutScale & {
  // The paper area's width and the Color Button's size bound the room the menu trims to.
  areaWidth: number;
  buttonSize: number;
  selected: PaintColor;
  erasing: boolean;
  disabled: boolean;
  onPick: (color: PaletteLabel) => void;
  onCustom: () => void;
}) {
  const custom = !erasing && isCustomColor(selected) ? selected : null;
  return (
    <RsdFlyoutMenu label="Colors" direction="row" spacing={COLOR_MENU_SPACING} {...scale}>
      <html.div
        role="radiogroup"
        aria-label="Paint colors"
        style={styles.row(COLOR_MENU_SPACING.gapPx)}
      >
        {colorMenuLabels(areaWidth, buttonSize).map((label) => (
          <PaintOption
            key={label}
            label={label}
            ringed={!erasing && selected === label}
            disabled={disabled}
            onPick={() => onPick(label)}
          />
        ))}
      </html.div>
      <MoreColorsOption custom={custom} disabled={disabled} onCustom={onCustom} />
    </RsdFlyoutMenu>
  );
}
