package art.splotch.migration.probe

import android.view.KeyEvent
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.events.Event
import com.facebook.react.views.view.ReactViewGroup

private const val GATE_KEY_EVENT = "topGateKey"

private fun gateKey(event: KeyEvent): String? = when (event.keyCode) {
  KeyEvent.KEYCODE_DEL -> "delete"
  KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "submit"
  else -> event.unicodeChar.toChar().takeIf { it in '0'..'9' }?.toString()
}

private class GateKeyEvent(surfaceId: Int, tag: Int, private val key: String) : Event<GateKeyEvent>(surfaceId, tag) {
  override fun getEventName() = GATE_KEY_EVENT
  override fun getEventData(): WritableMap = Arguments.createMap().apply { putString("key", key) }
  override fun canCoalesce() = false
}

class GateKeyboardView(private val reactContext: ThemedReactContext) : ReactViewGroup(reactContext) {
  init {
    isFocusable = true
    isFocusableInTouchMode = true
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    post { if (isAttachedToWindow) requestFocus() }
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    val key = gateKey(event) ?: return super.onKeyDown(keyCode, event)
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
      GateKeyEvent(UIManagerHelper.getSurfaceId(this), id, key)
    )
    return true
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean =
    gateKey(event) != null || super.onKeyUp(keyCode, event)
}

class SplotchGateKeyboardManager : SimpleViewManager<GateKeyboardView>() {
  override fun getName() = "SplotchGateKeyboard"
  override fun createViewInstance(context: ThemedReactContext) = GateKeyboardView(context)
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> = mutableMapOf(
    GATE_KEY_EVENT to mapOf("registrationName" to "onGateKey")
  )
}

class SplotchGateKeyboardPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = emptyList()
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = listOf(SplotchGateKeyboardManager())
}
