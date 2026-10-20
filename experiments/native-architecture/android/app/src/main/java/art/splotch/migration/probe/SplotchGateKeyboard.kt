package art.splotch.migration.probe

import android.os.Build
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

  // The open check owns the keys. A request made before the view is laid out fails, and a modal's
  // shortcut scope can take focus first, so the claim repeats once laid out and on window focus.
  private fun claimFocus() {
    post { if (isAttachedToWindow && !isFocused) requestFocus() }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    claimFocus()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    if (changed) claimFocus()
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) claimFocus()
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
  private val consumedKeys = mutableSetOf<Int>()
  var shortcutScope = "drawing"
  var shortcutsEnabled = false
    set(value) {
      field = value
      if (value) focusWhenAvailable() else if (isFocused) clearFocus()
    }

  init {
    isFocusable = true
    isFocusableInTouchMode = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) defaultFocusHighlightEnabled = false
  }

  // A text field and the grown-up check's receiver keep the keys; Escape still passes through this
  // scope's dispatchKeyEvent on its way to a focused descendant.
  private fun focusWhenAvailable() {
    post {
      val focused = rootView.findFocus()
      if (isAttachedToWindow && shortcutsEnabled && !hasFocus() && focused !is EditText && focused !is GateKeyboardView) requestFocus()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    focusWhenAvailable()
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) focusWhenAvailable()
  }

  private fun shortcutKey(event: KeyEvent): String? {
    if (!shortcutsEnabled) return null
    if (event.keyCode == KeyEvent.KEYCODE_ESCAPE) return "escape"
    if (shortcutScope == "drawing" && rootView.findFocus() !is EditText &&
      event.keyCode == KeyEvent.KEYCODE_Z && (event.isCtrlPressed || event.isMetaPressed) &&
      !event.isShiftPressed && !event.isAltPressed) return "undo"
    return null
  }

  // Focused descendants bypass this view's onKeyDown.
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_UP && consumedKeys.remove(event.keyCode)) return true
    val key = shortcutKey(event) ?: return super.dispatchKeyEvent(event)
    if (event.action != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event)
    consumedKeys.add(event.keyCode)
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
      ShortcutKeyEvent(UIManagerHelper.getSurfaceId(this), id, key)
    )
    return true
  }

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
