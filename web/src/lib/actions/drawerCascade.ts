export function drawerCascade(node: HTMLElement, opening: boolean) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function cancelReducedMotion() {
    if (reducedMotion.matches) node.classList.remove('opening');
  }
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
    node.classList.toggle('opening', value && !reducedMotion.matches);
  }
  update(opening);
  node.addEventListener('animationend', finish);
  reducedMotion.addEventListener('change', cancelReducedMotion);
  return {
    update,
    destroy() {
      node.removeEventListener('animationend', finish);
      reducedMotion.removeEventListener('change', cancelReducedMotion);
    },
  };
}
