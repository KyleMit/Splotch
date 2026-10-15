import { createElement, useEffect, useRef, type ReactNode } from 'react';
import { MIN_TEXT_ZOOM } from '../../../../web/src/lib/actions/textZoom';
import { attachPinchTextZoom } from '../../../../web/src/lib/actions/pinchTextZoomGesture';
export function SettingsTextZoom({
  children,
  enabled,
  onZoom,
}: {
  children: ReactNode;
  enabled: boolean;
  onZoom?: (zoom: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const current = useRef(enabled);
  current.current = enabled;
  useEffect(() => {
    const target = node.current;
    if (!target) return;
    const gesture = attachPinchTextZoom(target, () => ({ target, enabled: current.current }));
    const report = () => onZoom?.(Number(target.style.zoom) || MIN_TEXT_ZOOM);
    target.addEventListener('pointermove', report);
    return () => {
      target.removeEventListener('pointermove', report);
      gesture.destroy();
    };
  }, [onZoom, enabled]);
  useEffect(() => {
    if (!enabled && node.current) node.current.style.zoom = '';
  }, [enabled]);
  return createElement('div', { ref: node, 'data-testid': 'settings-text-zoom' }, children);
}
