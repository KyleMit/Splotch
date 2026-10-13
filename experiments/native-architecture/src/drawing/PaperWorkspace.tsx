import { useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { DrawingSurfaceHandle } from './DrawingSurface';
import type { PaperReference } from './paperSpace';
import { fittedPaper } from './paperGeometry';
import { useDrawingScreenStyles } from './drawingScreenStyles';

export function PaperWorkspace({
  children,
  surface,
  paper,
}: {
  children: ReactNode;
  surface: RefObject<DrawingSurfaceHandle | null>;
  paper: PaperReference;
}) {
  const styles = useDrawingScreenStyles();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const { width, height } = fittedPaper(space, paper);
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
      <View style={{ width, height }}>{children}</View>
    </View>
  );
}
