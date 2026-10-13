import { useContext, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import { styles as controlStyles } from './controls';
import { colors, dimensions, motion } from './tokens.css';
import { blobPath } from './blob';
import {
  MODAL_CLOSE_BORDER_PX,
  MODAL_CLOSE_INSET_PX,
  MODAL_CLOSE_PADDING_PX,
  MODAL_CONTROL_ICON_PX,
  MODAL_CONTROL_PRESSED_SCALE,
  MODAL_CONTROL_SIZE_PX,
  DIALOG_BACK_PADDING_PX,
} from './modalGeometry';
import { DialogScope, useDialogActive } from './dialogScope';

// React Native corner radii are circular, so the shipping blob outlines are drawn as paths. The
// close blob's 2px border is a stroke centered half its width inside the box.
const CONTROLS = {
  back: { icon: 'chevron-left', label: 'Back', shape: 'radiusBlob1', inset: 0 },
  close: {
    icon: 'close',
    label: 'Close',
    shape: 'radiusBlob2',
    inset: MODAL_CLOSE_BORDER_PX / 2,
  },
} as const;

type ControlKind = keyof typeof CONTROLS;

// The Install Banner's dismiss wears the same outlined close (app.css .banner-dismiss) under its
// own name.
export function HeaderControl({
  kind,
  label: name,
  disabled,
  onClick,
}: {
  kind: ControlKind;
  label?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const palette = useDrawingTheme();
  const active = useDialogActive();
  const [hovered, setHovered] = useState(false);
  const { icon, shape, inset } = CONTROLS[kind];
  const label = name ?? CONTROLS[kind].label;
  const path = useMemo(
    () => blobPath(shape, MODAL_CONTROL_SIZE_PX, MODAL_CONTROL_SIZE_PX, inset),
    [shape, inset]
  );
  const lit = hovered && !disabled;
  const outline =
    kind === 'close'
      ? {
          fill: lit ? palette.surfaceHover : palette.surface,
          stroke: lit ? palette.borderWarmStrong : palette.borderWarm,
          strokeWidth: MODAL_CLOSE_BORDER_PX,
        }
      : { fill: lit ? palette.brandWashHover : palette.brandWash };
  return (
    <RsdPressable
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled || !active}
      style={[
        styles.control(MODAL_CONTROL_SIZE_PX, `scale(${MODAL_CONTROL_PRESSED_SCALE})`),
        kind === 'back'
          ? styles.back(DIALOG_BACK_PADDING_PX)
          : styles.close(MODAL_CLOSE_BORDER_PX + MODAL_CLOSE_PADDING_PX),
        disabled && controlStyles.disabled,
      ]}
      onClick={onClick}
      onPointerEnter={(event: { pointerType?: string }) =>
        setHovered(event.pointerType === 'mouse')
      }
      onPointerLeave={() => setHovered(false)}
    >
      <Svg
        width={MODAL_CONTROL_SIZE_PX}
        height={MODAL_CONTROL_SIZE_PX}
        style={layers.blob}
        pointerEvents="none"
      >
        <Path d={path} {...outline} />
      </Svg>
      <html.div style={styles.glyph}>
        <RsdIcon name={icon} size={MODAL_CONTROL_ICON_PX} ink={undefined} muted={disabled} />
      </html.div>
    </RsdPressable>
  );
}

type DialogHeaderProps = { onClose: () => void; closeDisabled?: boolean } & (
  | { title: string; titleSize: 'xl' | 'lg'; onBack?: () => void }
  | { title?: never; titleSize?: never; onBack?: never }
);

// The shipping DialogHeader: back on a brand-wash blob, the title, and the outlined close. With no
// title the close floats in the card's top-right corner.
export function DialogHeader({
  title,
  titleSize,
  onBack,
  onClose,
  closeDisabled = false,
}: DialogHeaderProps) {
  const scope = useContext(DialogScope);
  const close = <HeaderControl kind="close" disabled={closeDisabled} onClick={onClose} />;
  if (title === undefined)
    return <html.div style={styles.floating(MODAL_CLOSE_INSET_PX)}>{close}</html.div>;
  const box = scope?.header;
  return (
    <html.header style={[styles.header, box && styles.padding(box.top, box.inline, box.bottom)]}>
      {onBack ? <HeaderControl kind="back" disabled={false} onClick={onBack} /> : null}
      <html.h2
        id={scope?.titleId}
        style={[
          controlStyles.semiboldText,
          styles.title,
          titleSize === 'lg' ? styles.titleLg : styles.titleXl,
        ]}
      >
        {title}
      </html.h2>
      {close}
    </html.header>
  );
}

const layers = StyleSheet.create({
  blob: { position: 'absolute', top: 0, left: 0 },
});

const styles = css.create({
  header: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space2,
    flexShrink: 0,
  },
  padding: (top: number, inline: number, bottom: number) => ({
    paddingTop: top,
    paddingBottom: bottom,
    paddingLeft: inline,
    paddingRight: inline,
  }),
  floating: (inset: number) => ({ position: 'absolute', top: inset, right: inset, zIndex: 1 }),
  title: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    margin: 0,
    color: colors.textStrong,
  },
  titleXl: { fontSize: dimensions.fontSizeXl },
  titleLg: { fontSize: dimensions.fontSizeLg },
  control: (size: number, pressed: string) => ({
    boxSizing: 'border-box',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size,
    height: size,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': pressed },
    transitionProperty: 'transform',
    transitionDuration: motion.durationFast,
  }),
  // Positioned so web paints it over the absolutely placed blob, as native's sibling order does.
  glyph: { position: 'relative', display: 'flex' },
  back: (padding: number) => ({ padding, marginRight: dimensions.space2 }),
  close: (padding: number) => ({ padding }),
});
