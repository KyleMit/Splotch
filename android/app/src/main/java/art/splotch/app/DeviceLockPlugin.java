package art.splotch.app;

import android.app.ActivityManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Surfaces whether App Pinning (lock-task mode) is currently engaged so the Parent Center
 * can confirm the lock is on (green check) and swap its "enable" steps for "unpin" steps.
 */
@CapacitorPlugin(name = "DeviceLock")
public class DeviceLockPlugin extends Plugin {
    @PluginMethod
    public void isLocked(PluginCall call) {
        ActivityManager am =
                (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        // Non-NONE covers both user-initiated pinning (PINNED) and MDM lock-task (LOCKED).
        boolean locked = am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        JSObject ret = new JSObject();
        ret.put("locked", locked);
        call.resolve(ret);
    }
}
