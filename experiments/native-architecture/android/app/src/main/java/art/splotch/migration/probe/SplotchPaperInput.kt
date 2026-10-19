package art.splotch.migration.probe

import android.view.MotionEvent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
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
          if (time >= startedAt) samples.pushMap(
            samplePayload(event.getHistoricalX(index, history), event.getHistoricalY(index, history), time.toDouble())
          )
        }
      }
      samples.pushMap(samplePayload(event.getX(index), event.getY(index), event.eventTime.toDouble()))
      contacts.pushMap(contactPayload(identifier.toString(), startedAt.toDouble(), when (event.getToolType(index)) {
        MotionEvent.TOOL_TYPE_FINGER -> "touch"
        MotionEvent.TOOL_TYPE_STYLUS, MotionEvent.TOOL_TYPE_ERASER -> "pen"
        MotionEvent.TOOL_TYPE_MOUSE -> "mouse"
        else -> "unknown"
      }, samples))
    }
    if (changed.size() == 0) return true
    dispatchInput(phase, changed, contacts)
    if (phase == "end") starts.remove(actionId)
    if (phase == "cancel") starts.clear()
    return true
  }

  // A sample, a contact and a packet as src/drawing/paperInput.ts reads them. The probe build's
  // replay (SplotchPaperReplay.kt) sends its packets through these three as well, after
  // locateInWindow(). A sample's x and y are view pixels.
  internal fun locateInWindow() = getLocationInWindow(origin)

  internal fun samplePayload(x: Float, y: Float, timestamp: Double): WritableMap {
    val density = resources.displayMetrics.density.toDouble()
    return Arguments.createMap().apply {
      putDouble("pageX", (x + origin[0]) / density)
      putDouble("pageY", (y + origin[1]) / density)
      putDouble("timestamp", timestamp)
    }
  }

  internal fun contactPayload(identifier: String, startedAt: Double, tool: String, samples: WritableArray): WritableMap =
    Arguments.createMap().apply {
      putString("identifier", identifier)
      putDouble("startedAt", startedAt)
      putString("tool", tool)
      putArray("samples", samples)
    }

  internal fun dispatchInput(phase: String, changed: WritableArray, contacts: WritableArray): Boolean {
    val density = resources.displayMetrics.density.toDouble()
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
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return false
    dispatcher.dispatchEvent(PaperInputEvent(UIManagerHelper.getSurfaceId(this), id, payload))
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
