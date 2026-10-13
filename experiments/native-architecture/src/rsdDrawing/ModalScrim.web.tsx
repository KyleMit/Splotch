import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Animated } from 'react-native';
import { MODAL_SCRIM_BLUR_PX, MODAL_SCRIM_FROSTED, MODAL_SCRIM_PLAIN } from './modalGeometry';

const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

function subscribe(changed: () => void) {
  const query = matchMedia(REDUCED_TRANSPARENCY_QUERY);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

const reducedTransparency = () => matchMedia(REDUCED_TRANSPARENCY_QUERY).matches;

// The shipping frosted backdrop. A raw element: neither React Native's nor React Strict DOM's
// style types carry backdrop-filter. The fade sets the frosted element's own opacity, as shipping
// fades its ::backdrop: under a fading ancestor, Chromium keeps that ancestor as the filter's
// backdrop root once the fade lands, and the canvas behind stays dimmed but unblurred.
export function ModalScrim({ opacity }: { opacity: Animated.Value }) {
  const plain = useSyncExternalStore(subscribe, reducedTransparency, () => false);
  const blur = plain ? 'none' : `blur(${MODAL_SCRIM_BLUR_PX}px)`;
  const scrim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listener = opacity.addListener(({ value }) => {
      if (scrim.current) scrim.current.style.opacity = String(value);
    });
    return () => opacity.removeListener(listener);
  }, [opacity]);
  return (
    <div
      ref={scrim}
      data-testid="modal-scrim"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: 0,
        background: plain ? MODAL_SCRIM_PLAIN : MODAL_SCRIM_FROSTED,
        backdropFilter: blur,
        WebkitBackdropFilter: blur,
      }}
    />
  );
}
