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

// The shipping handmade-paper grain: a low-alpha tile, so one texture serves both themes and only
// the paper color beneath it changes. rsd-native-drawing-frame.test.mjs holds the bundled copy
// byte-identical to web/src/lib/assets/handmade-paper.webp.
const source: ImageSourcePropType =
  typeof handmadePaper === 'string' ? { uri: handmadePaper } : handmadePaper;

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
    transformOrigin: 'top left',
    transform: [{ scale: density }],
  };
}

// Takes no props, so ink landing on the paper never re-renders the grain; only an appearance
// or screen-density change does.
export const PaperTexture = memo(function PaperTexture() {
  const { paper } = useDrawingTheme();
  const density = paperGrainDensity(useWindowDimensions().scale);
  return (
    <View
      testID="paper-texture"
      pointerEvents="none"
      style={[styles.fill, { backgroundColor: paper }]}
    >
      <Image testID="paper-grain" source={source} resizeMode="repeat" style={grainBox(density)} />
    </View>
  );
});
