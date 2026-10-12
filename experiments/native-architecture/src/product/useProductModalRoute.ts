import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { useDrawingProduct } from './useDrawingProduct';
export type ProductModal = 'none' | 'settings' | 'ai' | 'feedback' | 'gate' | 'parentCenter';
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
      product.ai.state?.open
    )
  );
}
export function useProductModalRoute(
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
  useEffect(() => {
    setRoute((current) =>
      current.shown === target
        ? current
        : current.shown === 'none'
          ? { shown: target, closing: false, epoch: current.epoch + 1 }
          : { ...current, closing: true }
    );
  }, [target]);
  function dismissed() {
    if (!routeRef.current.closing || routeRef.current.epoch !== route.epoch) return;
    const next = { shown: targetRef.current, closing: false, epoch: route.epoch + 1 };
    routeRef.current = next;
    setRoute(next);
    callbackRef.current(route.shown);
  }
  useEffect(() => {
    if (route.closing && Platform.OS !== 'ios') dismissed();
  }, [route.closing, target]);
  return { ...route, visible: !route.closing, dismissed };
}
