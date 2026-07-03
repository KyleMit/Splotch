import { isNative } from './platform';
import { lazyPluginModule } from './nativePlugin';

// Tactile feedback for confirming gestures. Native (iOS/Android) routes through
// @capacitor/haptics, which drives the Taptic Engine / vibrator motor — crucially
// the only path that works on iOS, where the web Vibration API is unsupported.
// On the web we fall back to navigator.vibrate (Android Chrome; a no-op
// elsewhere). Loaded lazily so the plugin is never pulled in on the web or SSR;
// returns the module namespace, not the Haptics proxy — see lazyPluginModule.
// The __IS_CAPACITOR__ ternary keeps the import() itself out of the web bundle
// (Rollup retains the thunk even when every caller is dead code); the reject arm
// is unreachable because every call site is gated on __IS_CAPACITOR__ too.
const getPlugin = lazyPluginModule(() =>
  __IS_CAPACITOR__ ? import('@capacitor/haptics') : Promise.reject(new Error('native-only plugin'))
);

// Fired the moment a drag crosses an accept threshold — a single crisp "click".
// __IS_CAPACITOR__ makes the branch compile-time dead on web so Rollup drops the
// plugin chunk entirely (isNative() alone can't tree-shake across modules).
export function impactThreshold(): void {
  if (__IS_CAPACITOR__ && isNative()) {
    getPlugin()
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }))
      .catch(() => {
        // Haptics are non-essential polish; a device without a motor (or a
        // denied capability) should never break the gesture.
      });
    return;
  }

  navigator.vibrate?.(15);
}
