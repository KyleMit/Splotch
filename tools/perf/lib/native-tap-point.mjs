import { readAndroidInputWindows, unoccludedTapPoint } from './android-touch-occlusion.mjs';

const IPHONE_HOME_GESTURE_INSET_PX = 44;
const NATIVE_TAP_EDGE_INSET_PX = 8;

// Read native occlusion before the probe arms so its round trip stays outside
// the measured action. Handsets also avoid the home gesture area.
export function nativeTapPoint(
  client,
  bounds,
  label,
  readWindows = readAndroidInputWindows,
  nativeWindow = null
) {
  const target = client.androidTouchTarget;
  const windows = target ? readWindows(target.serial) : null;
  const point = unoccludedTapPoint(bounds, windows, target?.packageName);
  if (
    client.deviceClass === 'handset' &&
    client.platformName?.toLowerCase() === 'ios' &&
    nativeWindow &&
    point.y > nativeWindow.y + nativeWindow.height - IPHONE_HOME_GESTURE_INSET_PX
  ) {
    // A compact drawer control can extend into the home gesture area.
    const safeY = nativeWindow.y + nativeWindow.height - IPHONE_HOME_GESTURE_INSET_PX;
    if (bounds.y + NATIVE_TAP_EDGE_INSET_PX <= safeY)
      point.y = Math.max(bounds.y + NATIVE_TAP_EDGE_INSET_PX, Math.min(point.y, safeY));
  }
  if (point.occludedBy) {
    console.warn(
      `[ipad-actions] ${label}: the target's centre is obscured by ${point.occludedBy.window} ` +
        `(combined opacity ${point.occludedBy.opacity.toFixed(2)}), which Android drops as an ` +
        `untrusted touch; tapping (${point.x}, ${point.y}) instead`
    );
  }
  return point;
}
