import { prefersReducedMotion } from '$lib/platform/reducedMotion';

// The springy release a press plays instead of snapping back: app.css's
// `swatch-press` keyframes, on the palette's swatches and on the Stroke Width
// trigger when a size is picked. Decorative only — it never gates the state
// change it acknowledges.
export const PRESS_RELEASE_CLASS = 'releasing';

// Spelled in app.css as `@keyframes swatch-press`; pressRelease.test.ts reads
// the stylesheet and fails if the two diverge.
export const PRESS_RELEASE_KEYFRAMES = 'swatch-press';

// A press landing while the last one is still settling rewinds that animation
// rather than stacking a second. Reduced motion plays nothing.
export function playPressRelease(node: HTMLElement) {
  if (prefersReducedMotion()) {
    node.classList.remove(PRESS_RELEASE_CLASS);
    return;
  }
  const release = node
    .getAnimations()
    .find(
      (animation) =>
        animation instanceof CSSAnimation && animation.animationName === PRESS_RELEASE_KEYFRAMES
    );
  if (release) {
    release.currentTime = 0;
    release.play();
    return;
  }
  node.classList.add(PRESS_RELEASE_CLASS);
}

// Drops the class once the release ends or is cancelled. Only the node's own
// animation counts: a swatch's selection rings animate its pseudo-elements, and
// their events bubble here too.
export function pressRelease(node: HTMLElement) {
  const clear = (event: AnimationEvent) => {
    if (event.target === node && event.pseudoElement === '')
      node.classList.remove(PRESS_RELEASE_CLASS);
  };
  node.addEventListener('animationend', clear);
  node.addEventListener('animationcancel', clear);
  return {
    destroy() {
      node.removeEventListener('animationend', clear);
      node.removeEventListener('animationcancel', clear);
    },
  };
}
