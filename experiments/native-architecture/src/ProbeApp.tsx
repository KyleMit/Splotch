import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';
import { ShippingFontGate } from './platform/shippingFont';

export function ProbeApp() {
  return (
    <DrawingSessionProvider>
      <ShippingFontGate>
        <RsdDrawingScreen />
      </ShippingFontGate>
    </DrawingSessionProvider>
  );
}
