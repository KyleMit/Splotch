import { useEffect, useState } from 'react';
import { crossDocumentNavigation, documentPage } from './appDocument';
import { openAppPage } from '../platform/appPath';
import { ShippingFontGate } from '../platform/shippingFont';
import { soundSettingsStorage } from '../platform/soundSettings';
import { createDrawingProduct, type DrawingProductOwner } from '../product/createDrawingProduct';
import { createNativeFeedback, type NativeFeedbackOwner } from '../feedback/feedback';
import { feedbackDevice, feedbackPolicyStorage, feedbackTransport } from '../platform/feedback';
import type { DocumentPage } from '../information/appPages';
import { RsdInformationPage } from '../rsdDrawing/RsdInformationPage';
import { RsdScreenBoundary } from '../rsdDrawing/RsdScreenBoundary';
import { PageNavigation } from '../rsdDrawing/RsdNotFoundPage';
import { deferredIconsSettled } from '../rsdDrawing/iconRegistry';

// The saved settings and the grown-up check a page's links answer to, and on the feedback page
// the form's owner. Both are created after hydration, as the drawing screen's are
// (useDrawingProduct.ts), so the hydrating render equals the build's render, which has neither.
function usePageProduct(page: DocumentPage | null) {
  const [owners, setOwners] = useState<{
    product: DrawingProductOwner;
    feedback: NativeFeedbackOwner | null;
  } | null>(null);
  const [, update] = useState(0);
  useEffect(() => {
    let alive = true;
    const product = createDrawingProduct(soundSettingsStorage, () => {
      if (alive) update((value) => value + 1);
    });
    const feedback =
      page === 'feedback'
        ? createNativeFeedback({
            transport: feedbackTransport,
            device: () => feedbackDevice(navigator.onLine),
            policyStorage: feedbackPolicyStorage,
            parent: product.port,
          })
        : null;
    setOwners({ product, feedback });
    void product.settings.load();
    void feedback?.loadPolicy();
    return () => {
      alive = false;
      feedback?.dispose();
      product.dispose();
    };
  }, [page]);
  const feedback = owners?.feedback ?? null;
  return {
    owner: owners?.product ?? null,
    state: owners?.product.getState() ?? null,
    feedback: { owner: feedback, state: feedback?.getState() ?? null },
  };
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
  const product = usePageProduct(page);
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
