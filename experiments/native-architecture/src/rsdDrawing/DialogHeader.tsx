import { useContext, useMemo, useState, type ReactNode, type Ref } from 'react';
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
import { tapPoint, type TapPoint } from './tapZone';

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

// Also the banners' Dismiss, which shipping draws as this same outlined close blob.
export function HeaderControl({
  kind,
  label = CONTROLS[kind].label,
  disabled,
  onClick,
}: {
  kind: ControlKind;
  label?: string;
  disabled: boolean;
  onClick: (point: TapPoint | null) => void;
}) {
  const palette = useDrawingTheme();
  const active = useDialogActive();
  const [hovered, setHovered] = useState(false);
  const { icon, shape, inset } = CONTROLS[kind];
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
      onClick={(event: unknown) => onClick(tapPoint(event))}
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
  | {
      title: string;
      titleSize: 'xl' | 'lg' | 'md';
      closeLabel?: never;
      closeInset?: never;
      /** Receives the tap's point, for a caller that guards the spot it repaints. */
      onBack?: (point: TapPoint | null) => void;
      /** Controls between the title and the close, as DialogHeader.svelte's `actions` snippet. */
      actions?: ReactNode;
      /** Makes the title a programmatic focus target, for a page that replaced the control
       * holding focus. */
      titleRef?: Ref<HTMLHeadingElement>;
    }
  | {
      title?: never;
      titleSize?: never;
      onBack?: never;
      actions?: never;
      titleRef?: never;
      /** What the floating close says it does, when closing is not dismissing (the AI Result
       * tucks a waiting picture away). */
      closeLabel?: string;
      /** The floating close's distance from the card's corner, where a card steps it out. */
      closeInset?: number;
    }
);

// The shipping DialogHeader: back on a brand-wash blob, the title, and the outlined close. With no
// title the close floats in the card's top-right corner.
export function DialogHeader({
  title,
  titleSize,
  onBack,
  actions,
  onClose,
  closeDisabled = false,
  titleRef,
  closeLabel,
  closeInset = MODAL_CLOSE_INSET_PX,
}: DialogHeaderProps) {
  const scope = useContext(DialogScope);
  const close = (
    <HeaderControl kind="close" label={closeLabel} disabled={closeDisabled} onClick={onClose} />
  );
  if (title === undefined) return <html.div style={styles.floating(closeInset)}>{close}</html.div>;
  const box = scope?.header;
  return (
    <html.header
      style={[
        styles.header,
        box && styles.padding(box.top, box.inline, box.bottom),
        scope?.seeThrough && styles.hidden,
      ]}
    >
      {onBack ? <HeaderControl kind="back" disabled={false} onClick={onBack} /> : null}
      <html.h2
        ref={titleRef}
        id={scope?.titleId}
        tabIndex={titleRef ? -1 : undefined}
        style={[
          controlStyles.semiboldText,
          styles.title,
          titleSize === 'xl' && styles.titleXl,
          titleSize === 'lg' && styles.titleLg,
          titleSize === 'md' && styles.titleMd,
        ]}
      >
        {title}
      </html.h2>
      {actions}
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
  hidden: { visibility: 'hidden' },
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
  titleMd: { fontSize: dimensions.fontSizeMd },
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
