package art.splotch.migration.probe

import android.app.ActivityManager
import android.content.Context
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

// Whether App Pinning (lock-task mode) holds the app, so Settings can confirm the lock and show how
// to unpin, as the shipping DeviceLockPlugin.java does. Any mode but NONE counts: a parent's
// pinning (PINNED) and a managed device's lock task (LOCKED) alike.
class SplotchDeviceLock(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SplotchDeviceLock"

  @ReactMethod
  fun isLocked(promise: Promise) {
    val manager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    promise.resolve(manager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE)
  }
}

class SplotchDeviceLockPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchDeviceLock(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
