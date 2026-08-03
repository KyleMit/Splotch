export const ACTION_UNAVAILABLE_CLASS = 'action-unavailable';

export function replayActionUnavailableFeedback(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.classList.remove(ACTION_UNAVAILABLE_CLASS);
  // Force a reflow between removal and re-add so repeated taps restart the animation.
  void element.offsetWidth;
  element.classList.add(ACTION_UNAVAILABLE_CLASS);
}
