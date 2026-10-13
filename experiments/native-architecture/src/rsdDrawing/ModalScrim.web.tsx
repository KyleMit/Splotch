import { useSyncExternalStore } from 'react';
import { MODAL_SCRIM_BLUR_PX, MODAL_SCRIM_FROSTED, MODAL_SCRIM_PLAIN } from './modalGeometry';

const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

function subscribe(changed: () => void) {
  const query = matchMedia(REDUCED_TRANSPARENCY_QUERY);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

const reducedTransparency = () => matchMedia(REDUCED_TRANSPARENCY_QUERY).matches;

// The shipping frosted backdrop. A raw element: neither React Native's nor React Strict DOM's
// style types carry backdrop-filter.
export function ModalScrim() {
  const plain = useSyncExternalStore(subscribe, reducedTransparency, () => false);
  const blur = plain ? 'none' : `blur(${MODAL_SCRIM_BLUR_PX}px)`;
  return (
    <div
      data-testid="modal-scrim"
      style={{
        position: 'absolute',
        inset: 0,
        background: plain ? MODAL_SCRIM_PLAIN : MODAL_SCRIM_FROSTED,
        backdropFilter: blur,
        WebkitBackdropFilter: blur,
      }}
    />
  );
}
