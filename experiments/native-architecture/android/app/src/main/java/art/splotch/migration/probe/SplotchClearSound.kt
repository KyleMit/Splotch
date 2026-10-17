package art.splotch.migration.probe

import android.media.AudioAttributes
import android.media.SoundPool
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.LifecycleState
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.util.UUID

private const val MAX_CLEAR_NOTE_VOICES = 64

private class ClearNoteBank(
  val id: String,
  uris: List<String>,
  private val handler: Handler,
  private val ready: (ClearNoteBank) -> Unit,
  private val failed: (ClearNoteBank) -> Unit,
) {
  private val pool = SoundPool.Builder().setMaxStreams(MAX_CLEAR_NOTE_VOICES)
    .setAudioAttributes(AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
    .build()
  private val sounds = IntArray(uris.size)
  private val streams = ArrayDeque<Int>()
  private var remaining = uris.size
  private var disposed = false
  private var loaded = false

  init {
    pool.setOnLoadCompleteListener { _, _, status ->
      handler.post {
        if (!disposed) {
          if (status != 0) fail()
          else {
            remaining -= 1
            if (remaining == 0) {
              loaded = true
              ready(this)
            }
          }
        }
      }
    }
    try {
      uris.forEachIndexed { index, uri ->
        val parsed = Uri.parse(uri)
        require(parsed.scheme == "file")
        val file = File(requireNotNull(parsed.path))
        require(file.isFile)
        sounds[index] = pool.load(file.path, 1)
        require(sounds[index] != 0)
      }
    } catch (_: Exception) { fail() }
  }

  private fun fail() {
    dispose()
    failed(this)
  }

  fun play(index: Int, volume: Float): Boolean {
    if (disposed || !loaded || index !in sounds.indices || !volume.isFinite() || volume <= 0 || volume > 1) return false
    val stream = pool.play(sounds[index], volume, volume, 1, 0, 1f)
    if (stream == 0) return false
    streams.addLast(stream)
    if (streams.size > MAX_CLEAR_NOTE_VOICES) streams.removeFirst()
    return true
  }

  fun stop() {
    streams.forEach { pool.stop(it) }
    streams.clear()
  }

  fun dispose() {
    if (disposed) return
    disposed = true
    stop()
    pool.release()
  }
}

class SplotchClearSound(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private val banks = mutableMapOf<String, ClearNoteBank>()
  private val reservations = mutableSetOf<String>()
  private val pending = mutableMapOf<String, Promise>()
  private var invalidated = false

  init {
    context.addLifecycleEventListener(this)
  }

  override fun getName() = "SplotchClearSound"

  @ReactMethod
  fun create(promise: Promise) {
    handler.post {
      if (invalidated || context.lifecycleState != LifecycleState.RESUMED)
        promise.reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.")
      else {
        val id = UUID.randomUUID().toString()
        reservations.add(id)
        promise.resolve(id)
      }
    }
  }

  @ReactMethod
  fun prepare(id: String, uris: ReadableArray, promise: Promise) {
    handler.post {
      if (invalidated || context.lifecycleState != LifecycleState.RESUMED ||
          !reservations.contains(id) || banks.containsKey(id) || uris.size() == 0) {
        promise.reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.")
        return@post
      }
      try {
        val paths = (0 until uris.size()).map { requireNotNull(uris.getString(it)) }
        var settled = false
        val bank = ClearNoteBank(id, paths, handler, { loaded ->
          if (!settled) {
            settled = true
            pending.remove(loaded.id)
            promise.resolve(true)
          }
        }, { failed ->
          banks.remove(failed.id)
          pending.remove(failed.id)
          reservations.remove(failed.id)
          if (!settled) {
            settled = true
            promise.reject("CLEAR_NOTE_UNAVAILABLE", "Clear notes are unavailable.")
          }
        })
        if (!settled) {
          banks[bank.id] = bank
          pending[bank.id] = promise
        }
      } catch (_: Exception) {
        promise.reject("CLEAR_NOTE_UNAVAILABLE", "Clear notes are unavailable.")
      }
    }
  }

  @ReactMethod
  fun play(id: String, index: Int, volume: Double, promise: Promise) {
    handler.post {
      val bank = banks[id]
      if (invalidated || context.lifecycleState != LifecycleState.RESUMED ||
          bank == null || !bank.play(index, volume.toFloat()))
        promise.reject("CLEAR_NOTE_UNAVAILABLE", "Clear note did not play.")
      else promise.resolve(true)
    }
  }

  @ReactMethod
  fun dispose(id: String) {
    handler.post {
      banks.remove(id)?.dispose()
      reservations.remove(id)
      pending.remove(id)?.reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.")
    }
  }

  private fun disposeAll() {
    banks.values.forEach { it.dispose() }
    banks.clear()
    reservations.clear()
    pending.values.forEach { it.reject("CLEAR_NOTE_CANCELLED", "Clear sound was cancelled.") }
    pending.clear()
  }

  override fun onHostPause() { handler.post { disposeAll() } }
  override fun onHostResume() = Unit
  override fun onHostDestroy() { handler.post { disposeAll() } }
  override fun invalidate() {
    handler.post {
      invalidated = true
      disposeAll()
      context.removeLifecycleEventListener(this)
    }
    super.invalidate()
  }
}

class SplotchClearSoundPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchClearSound(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
