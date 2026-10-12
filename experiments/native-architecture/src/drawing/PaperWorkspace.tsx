import { useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { DrawingSurfaceHandle } from './DrawingSurface';
import { PAPER_HEIGHT, PAPER_WIDTH } from './model';
import { useDrawingScreenStyles } from './drawingScreenStyles';

export function PaperWorkspace({
  children,
  surface,
}: {
  children: ReactNode;
  surface: RefObject<DrawingSurfaceHandle | null>;
}) {
  const styles = useDrawingScreenStyles();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const paperWidth = Math.min(
    space.width,
    (space.height * PAPER_WIDTH) / PAPER_HEIGHT,
    PAPER_WIDTH
  );
  return (
    <View
      style={styles.workspace}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSpace((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height }
        );
        surface.current?.refreshGeometry();
      }}
    >
      <View style={{ width: paperWidth }}>{children}</View>
    </View>
  );
}
