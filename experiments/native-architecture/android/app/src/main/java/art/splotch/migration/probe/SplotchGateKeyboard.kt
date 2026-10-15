package art.splotch.migration.probe

import android.view.KeyEvent
import android.widget.EditText
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.events.Event
import com.facebook.react.uimanager.annotations.ReactProp
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
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = listOf(SplotchGateKeyboardManager(), SplotchShortcutKeyboardManager(), SplotchPaperInputManager())
}

private const val SHORTCUT_KEY_EVENT = "topShortcutKey"

private class ShortcutKeyEvent(surfaceId: Int, tag: Int, private val key: String) : Event<ShortcutKeyEvent>(surfaceId, tag) {
  override fun getEventName() = SHORTCUT_KEY_EVENT
  override fun getEventData(): WritableMap = Arguments.createMap().apply { putString("key", key) }
  override fun canCoalesce() = false
}

class ShortcutKeyboardView(private val reactContext: ThemedReactContext) : ReactViewGroup(reactContext) {
  var shortcutScope = "drawing"
  var shortcutsEnabled = false
    set(value) {
      field = value
      if (value) focusWhenAvailable() else if (isFocused) clearFocus()
    }

  init {
    isFocusable = true
    isFocusableInTouchMode = true
  }

  private fun focusWhenAvailable() {
    post {
      if (isAttachedToWindow && shortcutsEnabled && !hasFocus() && rootView.findFocus() !is EditText) requestFocus()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    focusWhenAvailable()
  }

  private fun shortcutKey(event: KeyEvent): String? {
    if (!shortcutsEnabled) return null
    if (event.keyCode == KeyEvent.KEYCODE_ESCAPE) return "escape"
    if (shortcutScope == "drawing" && rootView.findFocus() !is EditText &&
      event.keyCode == KeyEvent.KEYCODE_Z && (event.isCtrlPressed || event.isMetaPressed) &&
      !event.isShiftPressed && !event.isAltPressed) return "undo"
    return null
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    val key = shortcutKey(event) ?: return super.onKeyDown(keyCode, event)
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
      ShortcutKeyEvent(UIManagerHelper.getSurfaceId(this), id, key)
    )
    return true
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean =
    shortcutKey(event) != null || super.onKeyUp(keyCode, event)
}

class SplotchShortcutKeyboardManager : ViewGroupManager<ShortcutKeyboardView>() {
  override fun getName() = "SplotchShortcutKeyboard"
  override fun createViewInstance(context: ThemedReactContext) = ShortcutKeyboardView(context)
  @ReactProp(name = "shortcutScope")
  fun setShortcutScope(view: ShortcutKeyboardView, scope: String) {
    require(scope == "drawing" || scope == "modal")
    view.shortcutScope = scope
  }
  @ReactProp(name = "shortcutsEnabled", defaultBoolean = false)
  fun setShortcutsEnabled(view: ShortcutKeyboardView, enabled: Boolean) { view.shortcutsEnabled = enabled }
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> = mutableMapOf(
    SHORTCUT_KEY_EVENT to mapOf("registrationName" to "onShortcutKey")
  )
}
