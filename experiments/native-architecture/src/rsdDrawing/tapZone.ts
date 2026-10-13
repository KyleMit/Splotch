// Shipping's launch guard (launchGuard.ts): a toddler mashes a spot several times before
// registering that anything happened, so a tap that repaints something under the finger arms a
// short-lived dead zone around that tap, and the rest of the burst there lands on nothing. Taps
// elsewhere, and keyboard or assistive activations, which have no finger to guard, go through.
// rsd-native-coloring-picker.test.mjs reads both values from launchGuard.ts.
export const TAP_ZONE_RADIUS_PX = 72;
export const TAP_ZONE_DURATION_MS = 600;

export type TapPoint = Readonly<{ x: number; y: number }>;
type TapZone = TapPoint & Readonly<{ expiresAt: number }>;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Where a press landed, from the click React Strict DOM hands an `html.*` element: a DOM click on
// the web, its own press-derived click natively. A keyboard click (detail 0) and an assistive
// activation (no page point) report null.
export function tapPoint(event: unknown): TapPoint | null {
  if (typeof event !== 'object' || event === null) return null;
  if ('detail' in event && event.detail === 0) return null;
  const x = 'pageX' in event ? event.pageX : undefined;
  const y = 'pageY' in event ? event.pageY : undefined;
  return finite(x) && finite(y) ? { x, y } : null;
}

export function armTapZone(point: TapPoint | null, now: number): TapZone | null {
  return point ? { ...point, expiresAt: now + TAP_ZONE_DURATION_MS } : null;
}

export function insideTapZone(zone: TapZone | null, point: TapPoint | null, now: number) {
  if (!zone || !point || now >= zone.expiresAt) return false;
  return (point.x - zone.x) ** 2 + (point.y - zone.y) ** 2 <= TAP_ZONE_RADIUS_PX ** 2;
}
