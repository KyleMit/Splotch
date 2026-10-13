import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { styles as controlStyles } from './controls';
import { MODAL_CONTROL_SIZE_PX } from './modalGeometry';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import { brandColors, colors, dimensions, motion } from './tokens.css';

// ActivePageChip.svelte's literals; rsd-native-coloring-picker.test.mjs reads them from shipping.
export const ACTIVE_PAGE_THUMBNAIL_PX = 34;
export const ACTIVE_PAGE_CLEAR_PX = 28;
export const ACTIVE_PAGE_CLEAR_PADDING_PX = 4;
// Shipping caps the name at 12ch; React Native has no ch unit, so this is twelve Quicksand
// digits at --font-size-sm.
export const ACTIVE_PAGE_NAME_MAX_CH = 12;
const ACTIVE_PAGE_NAME_MAX_WIDTH_PX = 92;
// At and under this window width the chip drops the page name and keeps the thumbnail and clear.
export const ACTIVE_PAGE_NAME_HIDDEN_MAX_WIDTH_PX = 360;

// The shipping Active Page Chip in the Coloring Book Picker's header: the applied page's
// thumbnail and name with a clear mark, and a press clears the page. It holds its pressed look
// from the press until the picker has closed, as shipping's activation-pending does.
export function RsdActivePageChip({
  name,
  preview,
  showName,
  onClear,
}: {
  name: string;
  preview: string | undefined;
  showName: boolean;
  onClear: () => void;
}) {
  const palette = useDrawingTheme();
  const [clearing, setClearing] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <RsdPressable
      type="button"
      aria-label={`Clear active coloring page: ${name}`}
      style={[
        styles.chip(MODAL_CONTROL_SIZE_PX),
        hovered && styles.hovered,
        clearing && styles.clearing,
      ]}
      onClick={() => {
        setClearing(true);
        onClear();
      }}
      onPointerMove={(event: { pointerType?: string }) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      {preview ? (
        <Image
          source={{ uri: preview }}
          resizeMode="contain"
          accessible={false}
          style={thumbnail.image}
        />
      ) : null}
      {showName ? (
        <html.span style={[controlStyles.semiboldText, styles.name(ACTIVE_PAGE_NAME_MAX_WIDTH_PX)]}>
          {name}
        </html.span>
      ) : null}
      <html.span
        aria-hidden
        style={[
          styles.clear(ACTIVE_PAGE_CLEAR_PX, ACTIVE_PAGE_CLEAR_PADDING_PX),
          clearing && styles.clearPressed,
        ]}
      >
        <RsdIcon
          name="close"
          size={ACTIVE_PAGE_CLEAR_PX - 2 * ACTIVE_PAGE_CLEAR_PADDING_PX}
          ink={clearing ? palette.surface : palette.dangerText}
          muted={false}
        />
      </html.span>
    </RsdPressable>
  );
}

const thumbnail = StyleSheet.create({
  image: { width: ACTIVE_PAGE_THUMBNAIL_PX, height: ACTIVE_PAGE_THUMBNAIL_PX, flexShrink: 0 },
});

const styles = css.create({
  chip: (height: number) => ({
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space2,
    flexShrink: 0,
    height,
    overflow: 'hidden',
    padding: dimensions.space1,
    cursor: 'pointer',
    backgroundColor: {
      default: colors.surface2,
      ':active': colors.dangerWash,
    },
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: {
      default: colors.borderWarm,
      ':active': colors.dangerText,
    },
    borderRadius: dimensions.radiusPill,
    transitionProperty: 'background-color, border-color',
    transitionDuration: motion.durationBase,
  }),
  hovered: { backgroundColor: colors.brandWash, borderColor: brandColors.brand },
  clearing: { backgroundColor: colors.dangerWash, borderColor: colors.dangerText },
  name: (maxWidth: number) => ({
    maxWidth,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineClamp: 1,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
  }),
  clear: (size: number, padding: number) => ({
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size,
    height: size,
    padding,
    borderRadius: size / 2,
    backgroundColor: colors.dangerWash,
  }),
  clearPressed: { backgroundColor: colors.dangerText },
});
