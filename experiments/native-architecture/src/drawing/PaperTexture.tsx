import { memo } from 'react';
import {
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type ImageStyle,
} from 'react-native';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import { useDrawingTheme } from './DrawingAppearance';
import { paperGrainDensity } from './paperGrainDensity';
import type { Point } from './model';

// The shipping handmade-paper grain: a low-alpha tile, so one texture serves both themes and only
// the paper color beneath it changes. rsd-native-drawing-frame.test.mjs holds the bundled copy
// byte-identical to web/src/lib/assets/handmade-paper.webp.
const source: ImageSourcePropType =
  typeof handmadePaper === 'string' ? { uri: handmadePaper } : handmadePaper;

// Repeat images shrink a tile to fit a smaller view; the grain test pins this minimum to the asset.
const PAPER_GRAIN_TILE_PX = 148;

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
});

// Shipping tiles the grain one CSS pixel per image pixel (app.css --paper-texture). The grain box
// is the paper over the density, rounded up so the scaled tiles never fall short of its far edges.
function grainBox(density: number): ImageStyle {
  const extent = `${Math.ceil(10000 / density) / 100}%` as const;
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: extent,
    height: extent,
    minWidth: PAPER_GRAIN_TILE_PX / density,
    minHeight: PAPER_GRAIN_TILE_PX / density,
    transformOrigin: 'top left',
    transform: [{ scale: density }],
  };
}

// No drawing state reaches the grain, so landing ink does not re-render it.
export const PaperTexture = memo(function PaperTexture({
  rightInset = 0,
  origin = { x: 0, y: 0 },
}: {
  rightInset?: number;
  origin?: Point;
}) {
  const { paper } = useDrawingTheme();
  const window = useWindowDimensions();
  const density = paperGrainDensity(window.scale);
  const x = origin.x + (rightInset ? window.width - rightInset : 0);
  const left = 0 - (((x % PAPER_GRAIN_TILE_PX) + PAPER_GRAIN_TILE_PX) % PAPER_GRAIN_TILE_PX);
  const top = 0 - (((origin.y % PAPER_GRAIN_TILE_PX) + PAPER_GRAIN_TILE_PX) % PAPER_GRAIN_TILE_PX);
  return (
    <View
      testID="paper-texture"
      pointerEvents="none"
      style={[styles.fill, { backgroundColor: paper }]}
    >
      <View testID="paper-grain-phase" style={[styles.fill, { left, top }]}>
        <Image testID="paper-grain" source={source} resizeMode="repeat" style={grainBox(density)} />
      </View>
    </View>
  );
});
