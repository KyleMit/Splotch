import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../drawing/Text';
import Svg, { Rect } from 'react-native-svg';
import {
  createDrawingStyles,
  useDrawingAppearance,
  useDrawingStyles,
} from '../drawing/DrawingAppearance';
import { InkAppearanceScope } from '../drawing/InkAppearance';
import { InkPaperScope } from '../drawing/InkPaper';
import { InkScene } from '../drawing/InkScene';
import type { Drawing } from '../drawing/model';
import { drawingPaper, paperSize } from '../drawing/paperSpace';
import { PageOutline } from '../drawing/PageOutline';
import { DRAWING_SCALE, PAPER_THEMES } from '../drawing/theme';
import { OfflineArtworkScope, type ArtworkMap } from '../offlineLibrary/artworkContext';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { AI_RESULT_HEIGHT_PX } from './uiState';

const imageLoaded = () => {};

export const CurrentDrawingPreview = memo(function CurrentDrawingPreview({
  drawing,
  artwork,
}: {
  drawing: Drawing;
  artwork: ArtworkMap;
}) {
  const theme = useDrawingAppearance();
  const styles = useDrawingStyles(themedStyles);
  const size = paperSize(drawingPaper(drawing));
  if (isOfflinePageId(drawing.pageId) && !artwork[drawing.pageId])
    return (
      <Text style={styles.notice}>
        The current picture preview is unavailable until its coloring artwork is ready.
      </Text>
    );
  return (
    <OfflineArtworkScope.Provider value={artwork}>
      <InkAppearanceScope.Provider value={{ pageId: drawing.pageId, theme }}>
        <InkPaperScope.Provider value={drawingPaper(drawing)}>
          <View pointerEvents="none" style={styles.preview} testID="current-drawing-preview">
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="xMidYMid meet"
              accessibilityRole="image"
              accessibilityLabel="Current drawing preview"
            >
              <Rect width={size.width} height={size.height} fill={PAPER_THEMES[theme].paper} />
              <InkScene checkpoint={null} strokes={drawing.strokes} onImageLoad={imageLoaded} />
              <PageOutline pageId={drawing.pageId} size={size} />
            </Svg>
          </View>
        </InkPaperScope.Provider>
      </InkAppearanceScope.Provider>
    </OfflineArtworkScope.Provider>
  );
});

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    preview: { width: '100%', height: AI_RESULT_HEIGHT_PX },
    notice: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
  })
);
