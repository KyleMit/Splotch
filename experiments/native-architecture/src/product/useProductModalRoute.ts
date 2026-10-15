import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { useDrawingProduct } from './useDrawingProduct';
import { aiSheetShown } from '../ai/uiState';
export type ProductModal =
  'none' | 'settings' | 'ai' | 'aiPrompt' | 'aiResult' | 'feedback' | 'gate' | 'parentCenter';
// Who reports a closing dialog's dismissal: the platform Modal (iOS alone has a dismissal
// callback, so elsewhere the route moves on at once), or the RSD ModalShell, which reports it on
// every platform once its exit has played.
export type ModalDismissal = 'platform' | 'reported';
export function isProductModalBlocked(
  shown: ProductModal,
  product: ReturnType<typeof useDrawingProduct>
) {
  return (
    shown !== 'none' ||
    !!(
      product.state?.gate.open ||
      product.state?.parentCenterOpen ||
      product.feedback.state?.open ||
      (product.ai.state && aiSheetShown(product.ai.state))
    )
  );
}
export function useProductModalRoute(
  dismissal: ModalDismissal,
  target: ProductModal,
  onDismissed: (outgoing: ProductModal) => void
) {
  const [route, setRoute] = useState<{ shown: ProductModal; closing: boolean; epoch: number }>({
    shown: 'none',
    closing: false,
    epoch: 0,
  });
  const targetRef = useRef(target);
  targetRef.current = target;
  const routeRef = useRef(route);
  routeRef.current = route;
  const callbackRef = useRef(onDismissed);
  callbackRef.current = onDismissed;
  useLayoutEffect(() => {
    setRoute((current) =>
      current.shown === target
        ? current
        : current.shown === 'none'
          ? { shown: target, closing: false, epoch: current.epoch + 1 }
          : { ...current, closing: true }
    );
  }, [target]);
  // Bound to the route it was rendered with, so a dismissal reported for an earlier epoch's dialog
  // is ignored.
  const dismissed = useCallback(() => {
    if (!routeRef.current.closing || routeRef.current.epoch !== route.epoch) return;
    const next = { shown: targetRef.current, closing: false, epoch: route.epoch + 1 };
    routeRef.current = next;
    setRoute(next);
    callbackRef.current(route.shown);
  }, [route.epoch, route.shown]);
  useEffect(() => {
    if (route.closing && dismissal === 'platform' && Platform.OS !== 'ios') dismissed();
  }, [route.closing, dismissal, dismissed]);
  return { ...route, visible: !route.closing, dismissed };
}
