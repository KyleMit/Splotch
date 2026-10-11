import { css, html } from 'react-strict-dom';
import { colors, dimensions, onBrand } from './tokens.css';
import { paintAppearance, paintLabel, type PaintColor } from '../drawing/palette';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { TOUCH_TARGET } from '../drawing/theme';

const SELECTION_BORDER_WIDTH_PX = 2;

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
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    padding: dimensions.space4,
    gap: dimensions.space3,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: dimensions.fontSizeMd,
  },
  compactAction: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space3,
    padding: dimensions.space3,
  },
  paintDot: (backgroundColor: string) => ({
    width: dimensions.space4,
    height: dimensions.space4,
    borderRadius: dimensions.radiusMd,
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
    color: onBrand,
    borderColor: colors.brandSolid,
  },
  disabled: { opacity: dimensions.disabledOpacity },
});

type ActionProps = {
  label: string;
  text?: string;
  disabled?: boolean;
  onClick: () => void;
} & (
  { selection?: never; selected?: never } | { selection: 'radio' | 'switch'; selected: boolean }
);

export function RsdAction({
  label,
  text = label,
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
      style={[
        styles.action,
        styles.touchTarget(TOUCH_TARGET),
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      {text}
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
  return (
    <html.button
      role="radio"
      aria-label={paintLabel(color)}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.action,
        styles.touchTarget(TOUCH_TARGET),
        styles.compactAction,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
      onClick={onClick}
    >
      <html.div aria-hidden style={styles.paintDot(appearance.hex)} />
      <html.span>{color}</html.span>
    </html.button>
  );
}
