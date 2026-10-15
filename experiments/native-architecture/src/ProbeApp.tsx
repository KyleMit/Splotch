import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';
import { AppRestartRoot } from './product/AppRestart';
import { ShippingFontGate } from './platform/shippingFont';
import { useEffect, useSyncExternalStore } from 'react';
import { currentAppPage, subscribeAppPage } from './platform/appPath';
import { RsdNotFoundPage } from './rsdDrawing/notFoundSurface';
import { RsdScreenBoundary } from './rsdDrawing/RsdScreenBoundary';
import { installAppSurface } from './platform/appSurface';

export function ProbeApp() {
  const page = useSyncExternalStore(subscribeAppPage, currentAppPage);
  useEffect(() => {
    if (page === 'drawing') return installAppSurface();
  }, [page]);
  return (
    <AppRestartRoot>
      <DrawingSessionProvider>
        <ShippingFontGate>
          <RsdScreenBoundary>
            {page === 'notFound' ? <RsdNotFoundPage /> : <RsdDrawingScreen page={page} />}
          </RsdScreenBoundary>
        </ShippingFontGate>
      </DrawingSessionProvider>
    </AppRestartRoot>
  );
}
