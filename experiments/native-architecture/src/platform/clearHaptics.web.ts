// The shipping web fallback (web/src/lib/platform/haptics.ts): the Vibration API where it exists
// (Android Chrome), nothing elsewhere. native-clear-projection.test.mjs pins the duration.
export const WEB_IMPACT_MS = 15;

export function impactThreshold(): void {
  navigator.vibrate?.(WEB_IMPACT_MS);
}
