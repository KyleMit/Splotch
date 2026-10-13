import { useState } from 'react';
import { View } from 'react-native';
import { css, html } from 'react-strict-dom';
import { DrawingSurface } from '../drawing/DrawingSurface';
import { fittedPaper, paperLifted } from '../drawing/paperGeometry';
import { drawingPaper } from '../drawing/paperSpace';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { colors } from './tokens.css';

// A lifted sheet wears the themed float shadow, whose dark value carries the hairline that edges
// the sheet against the night margin, as shipping's .paper-lifted does.
const styles = css.create({
  sheet: (width: number, height: number) => ({ width, height }),
  lifted: { boxShadow: colors.floatShadow },
});

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
  const frame = fittedPaper(space, drawingPaper(screen.history.drawing));
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
      <html.div
        style={[
          styles.sheet(frame.width, frame.height),
          paperLifted(space, frame) && styles.lifted,
        ]}
      >
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
      </html.div>
    </View>
  );
}
