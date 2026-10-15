export const FLYOUT_EXIT_DROP_PX = 6;
export const FLYOUT_EXIT_SCALE = 0.96;

export function flyoutExitEase(t: number) {
  return 1 - (1 - t) ** 4;
}
