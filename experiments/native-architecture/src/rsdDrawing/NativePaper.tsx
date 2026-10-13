import { useState } from 'react';
import { View } from 'react-native';
import { DrawingSurface } from '../drawing/DrawingSurface';
import { PAPER_HEIGHT, PAPER_WIDTH } from '../drawing/model';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';

export function NativePaper({
  screen,
  sound,
  menuOpen,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  menuOpen: boolean;
}) {
  const drawingScreenStyles = useDrawingScreenStyles();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const width = Math.min(space.width, (space.height * PAPER_WIDTH) / PAPER_HEIGHT, PAPER_WIDTH);
  return (
    <View
      style={drawingScreenStyles.workspace}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSpace((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height }
        );
        screen.surface.current?.refreshGeometry();
      }}
    >
      <View style={{ width }}>
        <DrawingSurface
          key={screen.recovery.generation}
          ref={screen.surface}
          drawing={screen.history.drawing}
          currentDrawing={screen.currentDrawing}
          color={sound.settings.selectedColor}
          brush={screen.brush}
          strokeWidth={sound.settings.strokeWidth}
          eraserWidth={sound.settings.eraserWidth}
          disabled={
            screen.busy ||
            screen.pictures !== null ||
            screen.pagePickerOpen ||
            screen.settingsOpen ||
            screen.colorPickerOpen ||
            menuOpen ||
            sound.settings.status === 'loading'
          }
          sound={sound.owner?.contacts ?? null}
          {...screen.recovery.callbacks}
        />
      </View>
    </View>
  );
}
