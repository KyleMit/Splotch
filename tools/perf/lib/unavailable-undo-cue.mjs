export function assertUnavailableUndoCue(sample) {
  if (
    !sample.activities?.some(
      (activity) =>
        activity.type === 'animationstart' &&
        activity.target?.includes('#undoButton') &&
        activity.animation?.startsWith('action-unavailable-')
    )
  ) {
    throw new Error('Unavailable undo tap did not produce its visual cue');
  }
}
