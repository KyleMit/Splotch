import { RsdDrawingScreen } from './rsdDrawing/RsdDrawingScreen';
import { DrawingSessionProvider } from './product/DrawingSession';
import { AppRestartRoot } from './product/AppRestart';
import { ShippingFontGate } from './platform/shippingFont';
import { useSyncExternalStore } from 'react';
import { currentAppPage, subscribeAppPage } from './platform/appPath';
import { RsdNotFoundPage } from './rsdDrawing/notFoundSurface';

export function ProbeApp() {
  const page = useSyncExternalStore(subscribeAppPage, currentAppPage);
  return (
    <AppRestartRoot>
      <DrawingSessionProvider>
        <ShippingFontGate>
          {page === 'notFound' ? <RsdNotFoundPage /> : <RsdDrawingScreen page={page} />}
        </ShippingFontGate>
      </DrawingSessionProvider>
    </AppRestartRoot>
  );
}
