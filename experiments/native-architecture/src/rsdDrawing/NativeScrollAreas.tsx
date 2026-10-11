import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { drawingScreenStyles } from '../drawing/drawingScreenStyles';

export function NativeDrawingLayout({
  controls,
  drawing,
  children,
}: {
  controls: ReactNode;
  drawing: boolean;
  children: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  return (
    <View style={[drawingScreenStyles.content, landscape && drawingScreenStyles.landscape]}>
      <ScrollView
        testID="rsd-paint-controls-viewport"
        accessibilityLabel="Drawing controls"
        accessible={false}
        style={landscape ? drawingScreenStyles.sideControls : drawingScreenStyles.topControls}
        contentContainerStyle={drawingScreenStyles.controls}
        removeClippedSubviews={false}
        scrollEnabled={!drawing}
      >
        {controls}
      </ScrollView>
      {children}
    </View>
  );
}

export function NativeDrawingStatus({
  drawing,
  children,
}: {
  drawing: boolean;
  children: ReactNode;
}) {
  return (
    <ScrollView
      testID="rsd-drawing-status-viewport"
      accessibilityLabel="Drawing status"
      accessible={false}
      style={drawingScreenStyles.feedback}
      contentContainerStyle={drawingScreenStyles.feedbackContent}
      removeClippedSubviews={false}
      scrollEnabled={!drawing}
    >
      {children}
    </ScrollView>
  );
}
