package art.splotch.app;

import android.content.pm.ActivityInfo;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the Auto orientation setting rotate even when the device's own Auto-rotate is off.
 * @capacitor/screen-orientation can only unlock to SCREEN_ORIENTATION_UNSPECIFIED, which defers to
 * that system toggle; SENSOR follows the accelerometer regardless of it, the same way an explicit
 * Portrait or Landscape request already overrides it. SENSOR rather than FULL_SENSOR keeps
 * upside-down portrait out.
 */
@CapacitorPlugin(name = "SensorOrientation")
public class SensorOrientationPlugin extends Plugin {
    @PluginMethod
    public void followSensor(PluginCall call) {
        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
        call.resolve();
    }
}
