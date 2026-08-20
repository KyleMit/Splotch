export const ACCEPT_RADIUS_FACTOR = 0.4;

export function getAcceptRadius() {
  return Math.min(window.innerWidth, window.innerHeight) * ACCEPT_RADIUS_FACTOR;
}
