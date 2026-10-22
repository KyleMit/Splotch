// The single crisp "click" the moment a drag crosses its accept threshold, at the Medium impact
// the shipping app asks of @capacitor/haptics (src/lib/platform/haptics.ts). Loaded on first
// use, as the shipping plugin is, so the drawing screen never waits on the native module.
export function impactThreshold(): void {
  import('expo-haptics')
    .then(({ ImpactFeedbackStyle, impactAsync }) => impactAsync(ImpactFeedbackStyle.Medium))
    .catch(() => {
      // Haptics are polish; a device without a motor must never break the gesture.
    });
}
