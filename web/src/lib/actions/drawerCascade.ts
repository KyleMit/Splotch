import { prefersReducedMotion, watchReducedMotion } from '$lib/platform/reducedMotion';

export function drawerCascade(node: HTMLElement, opening: boolean) {
  function finish(event: AnimationEvent) {
    if (event.animationName !== 'btn-cascade') return;
    const running = node
      .getAnimations({ subtree: true })
      .some(
        (animation) =>
          animation instanceof CSSAnimation &&
          animation.animationName === 'btn-cascade' &&
          animation.playState !== 'finished'
      );
    if (!running) node.classList.remove('opening');
  }
  function update(value: boolean) {
    node.classList.toggle('opening', value && !prefersReducedMotion());
  }
  update(opening);
  node.addEventListener('animationend', finish);
  // Reacts to the answer flipping mid-session, as PointerHalos does: the reduced
  // treatment cancels the cascade, so its animationend never clears the class.
  const stopWatching = watchReducedMotion((reduced) => {
    if (reduced) node.classList.remove('opening');
  });
  return {
    update,
    destroy() {
      node.removeEventListener('animationend', finish);
      stopWatching();
    },
  };
}
