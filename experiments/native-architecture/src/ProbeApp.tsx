import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';

export function ProbeApp() {
  return (
    <DrawingSessionProvider>
      <RsdDrawingScreen />
    </DrawingSessionProvider>
  );
}
