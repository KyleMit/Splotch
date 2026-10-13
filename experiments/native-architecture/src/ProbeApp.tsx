import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';
import { AppRestartRoot } from './product/AppRestart';
import { ShippingFontGate } from './platform/shippingFont';
import { isDrawingPath } from './platform/appPath';
import { RsdNotFoundPage } from './rsdDrawing/notFoundSurface';

export function ProbeApp() {
  if (!isDrawingPath())
    return (
      <ShippingFontGate>
        <RsdNotFoundPage />
      </ShippingFontGate>
    );
  return (
    <AppRestartRoot>
      <DrawingSessionProvider>
        <ShippingFontGate>
          <RsdDrawingScreen />
        </ShippingFontGate>
      </DrawingSessionProvider>
    </AppRestartRoot>
  );
}
