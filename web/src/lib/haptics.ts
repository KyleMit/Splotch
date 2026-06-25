import { isNative } from './platform';
import { lazyPluginModule } from './nativePlugin';

// Tactile feedback for confirming gestures. Native (iOS/Android) routes through
// @capacitor/haptics, which drives the Taptic Engine / vibrator motor — crucially
// the only path that works on iOS, where the web Vibration API is unsupported.
// On the web we fall back to navigator.vibrate (Android Chrome; a no-op
// elsewhere). Loaded lazily so the plugin is never pulled in on the web or SSR;
// returns the module namespace, not the Haptics proxy — see lazyPluginModule.
const getPlugin = lazyPluginModule(() => import('@capacitor/haptics'));

// Fired the moment a drag crosses an accept threshold — a single crisp "click".
export function impactThreshold(): void {
  if (isNative()) {
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
