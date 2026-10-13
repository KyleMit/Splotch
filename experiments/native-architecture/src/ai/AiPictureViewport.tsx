import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Action } from '../DrawingControls';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE } from '../drawing/theme';
import type { AiResult } from './journal';

const AI_PICTURE_ZOOM_MIN_PERCENT = 100;
const AI_PICTURE_ZOOM_MAX_PERCENT = 300;
const AI_PICTURE_ZOOM_STEP_PERCENT = 50;
const AI_PICTURE_VIEWPORT_HEIGHT_FRACTION = 0.4;
const AI_PICTURE_VIEWPORT_GUTTER_PX = DRAWING_SCALE.space4 * 2;

export function AiPictureViewport({ picture }: { picture: AiResult }) {
  const styles = useDrawingStyles(themedStyles);
  const windowSize = useWindowDimensions();
  const maximumSide = Math.min(
    Math.max(1, windowSize.width - AI_PICTURE_VIEWPORT_GUTTER_PX),
    windowSize.height * AI_PICTURE_VIEWPORT_HEIGHT_FRACTION
  );
  const [side, setSide] = useState(maximumSide);
  const [zoom, setZoom] = useState(AI_PICTURE_ZOOM_MIN_PERCENT);
  const imageSide = (side * zoom) / AI_PICTURE_ZOOM_MIN_PERCENT;
  return (
    <View style={styles.content}>
      <View style={styles.controls}>
        <Action
          label="Zoom in"
          disabled={zoom === AI_PICTURE_ZOOM_MAX_PERCENT}
          onPress={() =>
            setZoom((value) =>
              Math.min(AI_PICTURE_ZOOM_MAX_PERCENT, value + AI_PICTURE_ZOOM_STEP_PERCENT)
            )
          }
        />
        <Action
          label="Zoom out"
          disabled={zoom === AI_PICTURE_ZOOM_MIN_PERCENT}
          onPress={() =>
            setZoom((value) =>
              Math.max(AI_PICTURE_ZOOM_MIN_PERCENT, value - AI_PICTURE_ZOOM_STEP_PERCENT)
            )
          }
        />
        <Action
          label="Reset zoom"
          disabled={zoom === AI_PICTURE_ZOOM_MIN_PERCENT}
          onPress={() => setZoom(AI_PICTURE_ZOOM_MIN_PERCENT)}
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {`Picture zoom ${zoom}%.${zoom > AI_PICTURE_ZOOM_MIN_PERCENT ? ' Scroll the enlarged picture to see more.' : ''}`}
      </Text>
      <View
        style={[styles.viewport, { maxWidth: maximumSide }]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) setSide(Math.min(width, height));
        }}
      >
        <ScrollView
          key={`${picture.uri}:${zoom}:${side}`}
          nestedScrollEnabled
          focusable
          tabIndex={0}
          accessibilityLabel="AI picture vertical scrolling"
          style={styles.vertical}
          contentContainerStyle={{ width: side, height: imageSide }}
        >
          <ScrollView
            horizontal
            nestedScrollEnabled
            focusable
            tabIndex={0}
            accessibilityLabel="AI picture horizontal scrolling"
            style={{ width: side, height: imageSide, flexShrink: 0 }}
            contentContainerStyle={{ width: imageSide, height: imageSide }}
          >
            <Image
              accessibilityLabel="Opened AI picture"
              source={{ uri: picture.uri }}
              resizeMode="contain"
              style={{ width: imageSide, height: imageSide }}
            />
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    content: { gap: DRAWING_SCALE.space3 },
    controls: { flexDirection: 'row', flexWrap: 'wrap', gap: DRAWING_SCALE.space2 },
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
    viewport: {
      width: '100%',
      aspectRatio: 1,
      alignSelf: 'center',
      overflow: 'hidden',
      backgroundColor: palette.paper,
    },
    vertical: { flex: 1 },
  })
);
