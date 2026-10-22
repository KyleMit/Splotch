import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';
import { AppRestartRoot } from './product/AppRestart';
import { ShippingFontGate } from './platform/shippingFont';
import { useSyncExternalStore } from 'react';
import { currentAppPage, prerenderedAppPage, subscribeAppPage } from './platform/appPath';
import { RsdNotFoundPage } from './rsdDrawing/notFoundSurface';
import { RsdScreenBoundary } from './rsdDrawing/RsdScreenBoundary';
import { AppSurfaceRoot } from './platform/AppSurfaceRoot';

export function ProbeApp() {
  const page = useSyncExternalStore(subscribeAppPage, currentAppPage, prerenderedAppPage);
  return (
    <AppSurfaceRoot active={page === 'drawing'}>
      <AppRestartRoot>
        <DrawingSessionProvider>
          <ShippingFontGate>
            <RsdScreenBoundary>
              {page === 'notFound' ? <RsdNotFoundPage /> : <RsdDrawingScreen page={page} />}
            </RsdScreenBoundary>
          </ShippingFontGate>
        </DrawingSessionProvider>
      </AppRestartRoot>
    </AppSurfaceRoot>
  );
}
