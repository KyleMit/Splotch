import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';
import { AppRestartRoot } from './product/AppRestart';
import { ShippingFontGate } from './platform/shippingFont';
import { isDrawingPath } from './platform/appPath';
import { RsdNotFoundPage } from './rsdDrawing/notFoundSurface';
import { RsdScreenBoundary } from './rsdDrawing/RsdScreenBoundary';
import { useEffect } from 'react';
import { installAppSurface } from './platform/appSurface';

export function ProbeApp() {
  const drawing = isDrawingPath();
  useEffect(() => {
    if (drawing) return installAppSurface();
  }, [drawing]);
  if (!drawing)
    return (
      <ShippingFontGate>
        <RsdNotFoundPage />
      </ShippingFontGate>
    );
  return (
    <AppRestartRoot>
      <DrawingSessionProvider>
        <ShippingFontGate>
          <RsdScreenBoundary>
            <RsdDrawingScreen />
          </RsdScreenBoundary>
        </ShippingFontGate>
      </DrawingSessionProvider>
    </AppRestartRoot>
  );
}
