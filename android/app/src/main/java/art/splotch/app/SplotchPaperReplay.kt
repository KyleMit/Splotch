package art.splotch.app

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import androidx.core.os.HandlerCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ViewManager
import java.lang.ref.WeakReference
import kotlin.math.roundToLong
import org.json.JSONArray

// The perf probe's open-loop replay (src/drawing/perfReplay.ts; DEVELOPMENT.md, "Replay"). Only a
// probe build's JavaScript calls this module, so an intent extra alone replays nothing. Once the
// paper input view is laid out and settled, every packet goes out on the main looper at its
// scheduled time through the view's own payload builder, whatever the app is doing.

private const val PAPER_POLL_MS = 100L
private const val PAPER_WAIT_MS = 60_000L
private const val NANOS_PER_MILLI = 1_000_000.0
private const val MICROS_PER_MILLI = 1000.0
// Keeps replayed contacts apart from the view's own pointer identifiers.
private const val REPLAY_IDENTIFIER_PREFIX = "replay-"
private const val REPLAY_TOOL = "touch"

private class ReplaySample(val dt: Double, val x: Double, val y: Double)
private class ReplayContact(val id: String, val samples: List<ReplaySample>)
private class ReplayPacket(val t: Double, val phase: String, val changed: List<String>, val contacts: List<ReplayContact>)

private fun decodePackets(json: String): List<ReplayPacket> {
  val packets = JSONArray(json)
  return (0 until packets.length()).map { index ->
    val packet = packets.getJSONObject(index)
    val changed = packet.getJSONArray("changed")
    val contacts = packet.getJSONArray("contacts")
    ReplayPacket(
      packet.getDouble("t"),
      packet.getString("phase"),
      (0 until changed.length()).map { changed.getString(it) },
      (0 until contacts.length()).map { contactIndex ->
        val contact = contacts.getJSONObject(contactIndex)
        val samples = contact.getJSONArray("samples")
        ReplayContact(contact.getString("id"), (0 until samples.length()).map { sampleIndex ->
          val sample = samples.getJSONObject(sampleIndex)
          ReplaySample(sample.getDouble("dt"), sample.getDouble("x"), sample.getDouble("y"))
        })
      },
    )
  }
}

// sampleTimeMs in src/drawing/replayTrace.ts: a sample listed again in a later packet lands on
// exactly the time it had before, so its contact's samples never go backward.
private fun sampleTimeMs(t: Double, dt: Double) = Math.round((t + dt) * MICROS_PER_MILLI) / MICROS_PER_MILLI

private fun findLaidOutPaper(view: View): PaperInputView? {
  if (view is PaperInputView && view.isAttachedToWindow && view.isShown && view.width > 0 && view.height > 0) return view
  if (view is ViewGroup) for (index in 0 until view.childCount) findLaidOutPaper(view.getChildAt(index))?.let { return it }
  return null
}

// MotionEvent.getEventTime() and Handler.postAtTime read SystemClock.uptimeMillis, which is
// CLOCK_MONOTONIC like System.nanoTime().
private class ReplayRun(
  private val packets: List<ReplayPacket>,
  paper: PaperInputView,
  private val finish: (WritableMap) -> Unit,
) : Runnable {
  private val paper = WeakReference(paper)
  // Asynchronous messages pass the sync barrier a pending traversal posts, so a packet waits only
  // for main-thread work already running, not for the next frame.
  private val handler = HandlerCompat.createAsync(Looper.getMainLooper())
  private val startNs = System.nanoTime()
  private var next = 0
  private var delivered = 0
  private val latenessMs = Arguments.createArray()
  private var lastEmissionNs = startNs
  private val startedAtMs = mutableMapOf<String, Double>()

  private fun deadline(index: Int) = startNs + (packets[index].t * NANOS_PER_MILLI).roundToLong()

  fun begin() = run()

  // Emits every packet whose time has come, late ones back to back, then sleeps until the next.
  override fun run() {
    while (next < packets.size) {
      val now = System.nanoTime()
      val due = deadline(next)
      if (due > now) {
        handler.postAtTime(this, SystemClock.uptimeMillis() + Math.ceil((due - now) / NANOS_PER_MILLI).toLong())
        return
      }
      latenessMs.pushDouble((now - due) / NANOS_PER_MILLI)
      if (emit(packets[next])) delivered += 1
      lastEmissionNs = now
      next += 1
    }
    finish(Arguments.createMap().apply {
      putInt("packets", packets.size)
      putInt("delivered", delivered)
      putDouble("traceMs", packets.last().t)
      putDouble("durationMs", (lastEmissionNs - startNs) / NANOS_PER_MILLI)
      putArray("latenessMs", latenessMs)
    })
  }

  // Sample times are the replay's start on the MotionEvent clock plus the trace's own, so a late
  // packet carries the times it was due at, as a late touch event carries its digitizer's.
  private fun emit(packet: ReplayPacket): Boolean {
    val baseMs = startNs / NANOS_PER_MILLI
    for (contact in packet.contacts) startedAtMs.getOrPut(contact.id) { baseMs + sampleTimeMs(packet.t, contact.samples[0].dt) }
    val view = paper.get()?.takeIf { it.isAttachedToWindow } ?: return false
    view.locateInWindow()
    val changed = Arguments.createArray().apply { packet.changed.forEach { pushString(REPLAY_IDENTIFIER_PREFIX + it) } }
    val contacts = Arguments.createArray()
    for (contact in packet.contacts) {
      val samples = Arguments.createArray()
      for (sample in contact.samples) samples.pushMap(view.samplePayload(
        (sample.x * view.width).toFloat(), (sample.y * view.height).toFloat(), baseMs + sampleTimeMs(packet.t, sample.dt)
      ))
      contacts.pushMap(view.contactPayload(REPLAY_IDENTIFIER_PREFIX + contact.id, startedAtMs.getValue(contact.id), REPLAY_TOOL, samples))
    }
    return view.dispatchInput(packet.phase, changed, contacts)
  }
}

class SplotchPaperReplay(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val handler = Handler(Looper.getMainLooper())
  private var run: ReplayRun? = null

  override fun getName() = "SplotchPaperReplay"

  // The launch intent is readable once the activity resumes; the listener fires at once if it has.
  @ReactMethod
  fun requestedTrace(launchKey: String, promise: Promise) {
    context.addLifecycleEventListener(object : LifecycleEventListener {
      override fun onHostResume() {
        context.removeLifecycleEventListener(this)
        promise.resolve(context.currentActivity?.intent?.getStringExtra(launchKey))
      }
      override fun onHostPause() {}
      override fun onHostDestroy() {}
    })
  }

  @ReactMethod
  fun start(name: String, json: String, settleMs: Double, promise: Promise) {
    val packets = try {
      decodePackets(json)
    } catch (error: Exception) {
      return promise.reject("replay_trace", "Trace $name does not decode: ${error.message}", error)
    }
    if (packets.isEmpty()) return promise.reject("replay_trace", "Trace $name has no packets")
    handler.post {
      if (run != null) return@post promise.reject("replay_busy", "A replay is already running")
      awaitPaper(SystemClock.uptimeMillis() + PAPER_WAIT_MS, {
        handler.postDelayed({ begin(packets, promise) }, settleMs.toLong())
      }) { promise.reject("replay_paper", "No laid-out paper input view appeared") }
    }
  }

  private fun laidOutPaper() = context.currentActivity?.window?.decorView?.let(::findLaidOutPaper)

  private fun awaitPaper(limit: Long, ready: () -> Unit, missing: () -> Unit) {
    when {
      laidOutPaper() != null -> ready()
      SystemClock.uptimeMillis() >= limit -> missing()
      else -> handler.postDelayed({ awaitPaper(limit, ready, missing) }, PAPER_POLL_MS)
    }
  }

  private fun begin(packets: List<ReplayPacket>, promise: Promise) {
    if (run != null) return promise.reject("replay_busy", "A replay is already running")
    val paper = laidOutPaper() ?: return promise.reject("replay_paper", "The paper input view went away while settling")
    run = ReplayRun(packets, paper) { report ->
      run = null
      promise.resolve(report)
    }.also { it.begin() }
  }
}

class SplotchPaperReplayPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchPaperReplay(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
