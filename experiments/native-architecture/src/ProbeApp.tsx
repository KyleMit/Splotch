import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';
import { DRAWING_BACKEND } from './product/drawingBackend';

export function ProbeApp() {
  return (
    <DrawingSessionProvider backend={DRAWING_BACKEND}>
      <RsdDrawingScreen />
    </DrawingSessionProvider>
  );
}
