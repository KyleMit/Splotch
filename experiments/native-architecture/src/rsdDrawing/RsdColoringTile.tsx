import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { css, html } from 'react-strict-dom';
import type { ArtOrientation } from '../drawing/paperSpace';
import type { PaperTheme } from '../drawing/theme';
import { DRAWING_BRAND } from '../drawing/theme';
import { rgba } from './colorMix';
import { COVER_CAPTION_HEIGHT_PX, TILE_ART_INSET_PX, tileHeight } from './coloringGrid';
import { RsdPressable } from './RsdPressable';
import { tapPoint, type TapPoint } from './tapZone';
import { brandColors, colors, dimensions, motion } from './tokens.css';
import { styles as controlStyles } from './controls';

// ColoringTile.svelte's literals; rsd-native-coloring-picker.test.mjs reads them from shipping.
export const TILE_BORDER_PX = 2;
export const TILE_PRESSED_SCALE = 0.96;
export const TILE_HOVER_LIFT_PX = 2;
// Shipping mixes --brand 25% into transparent under a hovered tile.
export const TILE_HOVER_SHADOW = `0 4px 12px ${rgba(DRAWING_BRAND, 0.25)}`;

// The cover thumbnails are dark line art on white; shipping blends them into the tile's paper
// tone, and in dark mode inverts them to chalk lines first (the --lineart-* tokens).
const COVER_LINE_ART = StyleSheet.create({
  light: { mixBlendMode: 'multiply' },
  dark: { filter: 'invert(1)', mixBlendMode: 'screen' },
});

type TileShape =
  | { shape: 'cover'; label: string; theme: PaperTheme }
  | { shape: ArtOrientation; label?: never; theme?: never };

// The shipping Coloring Tile: a little paper card previewing a book cover or a page's line art,
// following the theme so the preview matches the applied page. A cover carries its book's name
// in a caption band; a page tile is art alone.
export function RsdColoringTile({
  image,
  width,
  accessibleName,
  onPress,
  ...tile
}: TileShape & {
  image: string | undefined;
  width: number;
  accessibleName: string;
  onPress: (point: TapPoint | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const height = tileHeight(tile.shape, width);
  const artBottom = tile.shape === 'cover' ? COVER_CAPTION_HEIGHT_PX : TILE_ART_INSET_PX;
  return (
    <RsdPressable
      type="button"
      aria-label={accessibleName}
      style={[
        styles.tile(width, height, TILE_BORDER_PX, `scale(${TILE_PRESSED_SCALE})`),
        hovered &&
          styles.hovered(
            `translateY(-${TILE_HOVER_LIFT_PX}px)`,
            `scale(${TILE_PRESSED_SCALE})`,
            TILE_HOVER_SHADOW
          ),
      ]}
      onClick={(event: unknown) => onPress(tapPoint(event))}
      onPointerMove={(event: { pointerType?: string }) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      {image ? (
        <View
          pointerEvents="none"
          style={[
            art.frame,
            { bottom: artBottom },
            tile.shape === 'cover' && COVER_LINE_ART[tile.theme],
          ]}
        >
          <Image
            source={{ uri: image }}
            resizeMode="contain"
            accessible={false}
            style={art.image}
          />
        </View>
      ) : null}
      {tile.shape === 'cover' ? (
        <html.span
          style={[
            controlStyles.semiboldText,
            styles.caption(COVER_CAPTION_HEIGHT_PX),
            styles.captionText,
          ]}
        >
          {tile.label}
        </html.span>
      ) : null}
    </RsdPressable>
  );
}

const art = StyleSheet.create({
  frame: {
    position: 'absolute',
    top: TILE_ART_INSET_PX,
    left: TILE_ART_INSET_PX,
    right: TILE_ART_INSET_PX,
  },
  image: { width: '100%', height: '100%' },
});

const styles = css.create({
  tile: (width: number, height: number, border: number, pressed: string) => ({
    boxSizing: 'border-box',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width,
    height,
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    backgroundColor: colors.surface2,
    borderWidth: border,
    borderStyle: 'solid',
    borderColor: colors.borderWarmStrong,
    borderRadius: dimensions.radiusMd,
    boxShadow: colors.floatShadow,
    transform: { default: 'scale(1)', ':active': pressed },
    transitionProperty: 'transform, background-color, border-color, box-shadow',
    transitionDuration: motion.durationFast,
  }),
  hovered: (lift: string, pressed: string, shadow: string) => ({
    borderColor: brandColors.brand,
    backgroundColor: colors.brandWash,
    boxShadow: shadow,
    transform: { default: lift, ':active': pressed },
  }),
  caption: (height: number) => ({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: dimensions.space2,
    paddingRight: dimensions.space2,
    backgroundColor: colors.surface2,
  }),
  captionText: {
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    textAlign: 'center',
  },
});
