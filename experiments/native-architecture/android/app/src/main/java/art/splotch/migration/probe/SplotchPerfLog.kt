package art.splotch.migration.probe

import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

private const val PERF_LOG_TAG = "SplotchPerf"

// One perf-probe line (src/drawing/perfProbe.native.ts) to logcat under its own tag, so a host
// reads it with `adb logcat -s SplotchPerf`.
class SplotchPerfLog(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SplotchPerfLog"

  @ReactMethod
  fun write(line: String) {
    Log.i(PERF_LOG_TAG, line)
  }
}

class SplotchPerfLogPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchPerfLog(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
