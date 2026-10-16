import { View } from 'react-native';
import { DrawingSurface } from '../drawing/DrawingSurface';
import { PaperTexture } from '../drawing/PaperTexture';
import type { PresentedFrame } from '../drawing/paperPresentation';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useSecondTouchRoutes } from './secondTouchPress';

const paperGrain = <PaperTexture />;

export function NativePaper({
  screen,
  sound,
  menuOpen,
  lifted,
  frame,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  menuOpen: boolean;
  // A sheet lifted off the margin wears its own grain; one that fills the slot shows the slot's.
  lifted: boolean;
  frame: PresentedFrame;
}) {
  const drawingScreenStyles = useDrawingScreenStyles();
  const contacts = useSecondTouchRoutes();
  return (
    <View
      style={drawingScreenStyles.workspace}
      onLayout={() => {
        screen.surface.current?.refreshGeometry();
      }}
    >
      <View
        testID="rsd-paper-plane"
        style={{ position: 'absolute', ...frame }}
        onLayout={() => screen.surface.current?.refreshGeometry()}
      >
        <DrawingSurface
          key={screen.recovery.generation}
          ref={screen.surface}
          drawing={screen.history.drawing}
          undoGhost={screen.undoGhost}
          currentDrawing={screen.currentDrawing}
          isChromeTouch={contacts?.containsPoint}
          color={sound.settings.selectedColor}
          brush={screen.brush}
          strokeWidth={sound.settings.strokeWidth}
          eraserWidth={sound.settings.eraserWidth}
          disabled={
            screen.busy ||
            screen.pagePickerOpen ||
            screen.settingsOpen ||
            screen.colorPickerOpen ||
            menuOpen ||
            sound.settings.status === 'loading'
          }
          sound={sound.owner?.contacts ?? null}
          underlay={lifted ? paperGrain : null}
          {...screen.recovery.callbacks}
        />
      </View>
    </View>
  );
}
