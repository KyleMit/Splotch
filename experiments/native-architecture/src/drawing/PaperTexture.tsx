import { memo } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import handmadePaper from '../../assets/paper/handmade-paper.webp';
import { useDrawingTheme } from './DrawingAppearance';

// The shipping handmade-paper grain: a low-alpha tile, so one texture serves both themes and only
// the paper color beneath it changes. rsd-native-drawing-frame.test.mjs holds the bundled copy
// byte-identical to web/src/lib/assets/handmade-paper.webp.
const source: ImageSourcePropType =
  typeof handmadePaper === 'string' ? { uri: handmadePaper } : handmadePaper;

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // React Native Web otherwise sizes an image to its source, one tile.
  grain: { width: '100%', height: '100%' },
});

// Takes no props, so ink landing on the paper never re-renders the grain; only an appearance
// change does.
export const PaperTexture = memo(function PaperTexture() {
  const { paper } = useDrawingTheme();
  return (
    <View
      testID="paper-texture"
      pointerEvents="none"
      style={[styles.fill, { backgroundColor: paper }]}
    >
      <Image source={source} resizeMode="repeat" style={[styles.fill, styles.grain]} />
    </View>
  );
});
