import { css, html } from 'react-strict-dom';
import { colors, dimensions, brandColors, fonts } from './tokens.css';
import { TOUCH_TARGET } from '../drawing/theme';
import { useDialogActive } from './dialogScope';

const SELECTION_BORDER_WIDTH_PX = 2;

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
  semiboldText: { fontFamily: fonts.semiboldFamily, fontWeight: fonts.semiboldWeight },
  row: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space3 },
  stack: { display: 'flex', flexDirection: 'column', gap: dimensions.space3 },
  toolbar: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space2 },
  // ModalShell's card owns the surface and the inset; a dialog body only stacks its content.
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space3,
    color: colors.text,
    fontSize: dimensions.fontSizeMd,
  },
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
  const active = useDialogActive();
  return (
    <html.button
      disabled={disabled || !active}
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
