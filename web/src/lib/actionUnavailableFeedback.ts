export const ACTION_UNAVAILABLE_CLASS = 'action-unavailable';

const ACTION_UNAVAILABLE_ANIMATION_PREFIX = `${ACTION_UNAVAILABLE_CLASS}-`;
const activeReplays = new WeakMap<HTMLElement, object>();

function isActionUnavailableAnimation(animation: Animation) {
  return (
    'animationName' in animation &&
    typeof animation.animationName === 'string' &&
    animation.animationName.startsWith(ACTION_UNAVAILABLE_ANIMATION_PREFIX)
  );
}

export function replayActionUnavailableFeedback(element: HTMLElement | null | undefined) {
  if (!element) return;
  const replay = {};
  activeReplays.set(element, replay);
  element.classList.remove(ACTION_UNAVAILABLE_CLASS);
  // Force a reflow between removal and re-add so repeated taps restart the animation.
  void element.offsetWidth;
  element.classList.add(ACTION_UNAVAILABLE_CLASS);

  const animations = (element.getAnimations?.() ?? []).filter(isActionUnavailableAnimation);
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    // Removing the class settles a superseded replay; only the latest replay owns cleanup.
    if (activeReplays.get(element) !== replay) return;
    activeReplays.delete(element);
    element.classList.remove(ACTION_UNAVAILABLE_CLASS);
  });
}
