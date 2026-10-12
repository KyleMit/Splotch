import { Image, StyleSheet } from 'react-native';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { TOUCH_TARGET } from '../drawing/theme';
import type { AiStyle } from './contract';
import { aiStylePreviewSource } from './stylePreviewAssets';

export const AI_STYLE_TILE_WIDTH_PX = TOUCH_TARGET * 3;
export const AI_STYLE_TILE_BORDER_PX = 3;
const AI_STYLE_PREVIEW_HEIGHT_PX = TOUCH_TARGET * 2;

export function AiStylePreview({ style }: { style: AiStyle }) {
  const theme = useDrawingAppearance();
  return (
    <Image
      accessible={false}
      source={aiStylePreviewSource(style, theme)}
      resizeMode="cover"
      style={styles.image}
    />
  );
}

const styles = StyleSheet.create({ image: { width: '100%', height: AI_STYLE_PREVIEW_HEIGHT_PX } });
