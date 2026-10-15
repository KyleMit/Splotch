package art.splotch.migration.probe

import android.view.MotionEvent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

private const val PAPER_INPUT_EVENT = "topPaperInput"

private class PaperInputEvent(surfaceId: Int, tag: Int, private val payload: WritableMap) : Event<PaperInputEvent>(surfaceId, tag) {
  override fun getEventName() = PAPER_INPUT_EVENT
  override fun getEventData() = payload
  override fun canCoalesce() = false
}

class PaperInputView(private val reactContext: ThemedReactContext) : ReactViewGroup(reactContext) {
  private val starts = mutableMapOf<Int, Long>()
  private var sequence = 0L
  private val origin = IntArray(2)

  override fun onInterceptTouchEvent(event: MotionEvent) = true

  override fun onTouchEvent(event: MotionEvent): Boolean {
    val phase = when (event.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> "start"
      MotionEvent.ACTION_MOVE -> "move"
      MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> "end"
      MotionEvent.ACTION_CANCEL -> "cancel"
      else -> return true
    }
    if (event.actionMasked == MotionEvent.ACTION_DOWN) starts.clear()
    val actionId = event.getPointerId(event.actionIndex)
    if (phase == "start") starts[actionId] = event.eventTime
    getLocationInWindow(origin)
    val density = resources.displayMetrics.density.toDouble()
    val changed = Arguments.createArray()
    val contacts = Arguments.createArray()
    for (index in 0 until event.pointerCount) {
      val identifier = event.getPointerId(index)
      val startedAt = starts[identifier] ?: continue
      val changing = phase == "move" || phase == "cancel" || identifier == actionId
      if (changing) changed.pushString(identifier.toString())
      val samples = Arguments.createArray()
      if (changing && phase == "move") {
        for (history in 0 until event.historySize) {
          val time = event.getHistoricalEventTime(history)
          if (time >= startedAt) samples.pushMap(Arguments.createMap().apply {
            putDouble("pageX", (event.getHistoricalX(index, history) + origin[0]) / density)
            putDouble("pageY", (event.getHistoricalY(index, history) + origin[1]) / density)
            putDouble("timestamp", time.toDouble())
          })
        }
      }
      samples.pushMap(Arguments.createMap().apply {
        putDouble("pageX", (event.getX(index) + origin[0]) / density)
        putDouble("pageY", (event.getY(index) + origin[1]) / density)
        putDouble("timestamp", event.eventTime.toDouble())
      })
      contacts.pushMap(Arguments.createMap().apply {
        putString("identifier", identifier.toString())
        putDouble("startedAt", startedAt.toDouble())
        putString("tool", when (event.getToolType(index)) {
          MotionEvent.TOOL_TYPE_FINGER -> "touch"
          MotionEvent.TOOL_TYPE_STYLUS, MotionEvent.TOOL_TYPE_ERASER -> "pen"
          MotionEvent.TOOL_TYPE_MOUSE -> "mouse"
          else -> "unknown"
        })
        putArray("samples", samples)
      })
    }
    if (changed.size() == 0) return true
    val payload = Arguments.createMap().apply {
      putDouble("sequence", sequence++.toDouble())
      putString("phase", phase)
      putArray("changed", changed)
      putArray("contacts", contacts)
      putMap("viewport", Arguments.createMap().apply {
        putDouble("width", rootView.width / density)
        putDouble("height", rootView.height / density)
        val bottom = ViewCompat.getRootWindowInsets(this@PaperInputView)?.getInsets(WindowInsetsCompat.Type.systemGestures())?.bottom ?: 0
        putDouble("bottomInset", bottom / density)
      })
    }
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
      PaperInputEvent(UIManagerHelper.getSurfaceId(this), id, payload)
    )
    if (phase == "end") starts.remove(actionId)
    if (phase == "cancel") starts.clear()
    return true
  }

  override fun onDetachedFromWindow() {
    starts.clear()
    super.onDetachedFromWindow()
  }
}

class SplotchPaperInputManager : ReactViewManager() {
  override fun getName() = "SplotchPaperInput"
  override fun createViewInstance(context: ThemedReactContext) = PaperInputView(context)
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    (super.getExportedCustomDirectEventTypeConstants() ?: mutableMapOf()).apply {
      put(PAPER_INPUT_EVENT, mapOf("registrationName" to "onPaperInput"))
    }
}
