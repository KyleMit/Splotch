import { useState } from 'react';
import { View } from 'react-native';
import { DrawingSurface } from '../drawing/DrawingSurface';
import { PaperTexture } from '../drawing/PaperTexture';
import { fittedPaper } from '../drawing/paperGeometry';
import { drawingPaper } from '../drawing/paperSpace';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';

const paperGrain = <PaperTexture />;

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
  const { width, height } = fittedPaper(space, drawingPaper(screen.history.drawing));
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
      <View style={{ width, height }}>
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
          underlay={paperGrain}
          {...screen.recovery.callbacks}
        />
      </View>
    </View>
  );
}
