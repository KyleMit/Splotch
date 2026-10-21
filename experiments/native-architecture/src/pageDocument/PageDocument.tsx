import { useEffect, useState } from 'react';
import { crossDocumentNavigation, documentPage } from './appDocument';
import { openAppPage } from '../platform/appPath';
import { ShippingFontGate } from '../platform/shippingFont';
import { soundSettingsStorage } from '../platform/soundSettings';
import { createDrawingProduct, type DrawingProductOwner } from '../product/createDrawingProduct';
import { RsdInformationPage } from '../rsdDrawing/RsdInformationPage';
import { RsdScreenBoundary } from '../rsdDrawing/RsdScreenBoundary';
import { PageNavigation } from '../rsdDrawing/RsdNotFoundPage';
import { deferredIconsSettled } from '../rsdDrawing/iconRegistry';

// The saved settings and the grown-up check a page's links answer to. The owner is created after
// hydration, as the drawing screen's is (useDrawingProduct.ts), so the hydrating render equals
// the build's render, which has none.
function usePageProduct() {
  const [owner, setOwner] = useState<DrawingProductOwner | null>(null);
  const [, update] = useState(0);
  useEffect(() => {
    let alive = true;
    const created = createDrawingProduct(soundSettingsStorage, () => {
      if (alive) update((value) => value + 1);
    });
    setOwner(created);
    void created.settings.load();
    return () => {
      alive = false;
      created.dispose();
    };
  }, []);
  return { owner, state: owner?.getState() ?? null, feedback: { owner: null, state: null } };
}

const ignoreDrawingReturn = () => {};
// Read on navigation, never during the build's render, which has no location.
const documentLocation = { assign: (url: string) => location.assign(url) };

// The page's icons, which the drawing screen loads after it paints: the build renders and the
// browser hydrates only once they are in, so both renders draw them. The footer's Splotchy mark
// (its markup alone is about 90 KB) still loads after hydration, as it does over the paper.
export function pageIconsSettled() {
  return deferredIconsSettled();
}

export function PageDocument() {
  const [page] = useState(documentPage);
  const [navigation] = useState(() =>
    page === null ? openAppPage : crossDocumentNavigation(page, openAppPage, documentLocation)
  );
  const product = usePageProduct();
  if (page === null) return null;
  return (
    <ShippingFontGate>
      <RsdScreenBoundary>
        <PageNavigation.Provider value={navigation}>
          <RsdInformationPage
            page={page}
            product={product}
            drawingVisited={false}
            standalone={false}
            onDrawingReturn={ignoreDrawingReturn}
          />
        </PageNavigation.Provider>
      </RsdScreenBoundary>
    </ShippingFontGate>
  );
}
