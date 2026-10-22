package art.splotch.app

import androidx.lifecycle.Observer
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import org.json.JSONObject
import java.io.File
import java.util.UUID

internal class SplotchLibraryDownloads(private val context: ReactApplicationContext) {
  companion object {
    private const val WORK_TAG = "splotch-library-download"
  }
  private val manager = WorkManager.getInstance(context)
  private val observers = mutableMapOf<UUID, Pair<UUID, Observer<WorkInfo?>>>()

  fun install(marker: String, identity: String, allowMetered: Boolean, promise: Promise) {
    SplotchLibraryFiles.parse(marker, identity)
    val job = File(SplotchLibraryFiles.jobs(context), "current.json")
    val previous = synchronized(SplotchLibraryFiles.lock) {
      runCatching { JSONObject(job.readText()) }.getOrNull()
    }
    val existing = manager.getWorkInfosForUniqueWork(WORK_TAG).get().firstOrNull { !it.state.isFinished }
    val joins = existing != null && previous != null && previous.optString("marker") == marker &&
      previous.optString("identity") == identity && previous.optBoolean("allowMetered") == allowMetered
    val joinedAttemptCount = if (joins && existing?.state == WorkInfo.State.ENQUEUED) requireNotNull(existing).runAttemptCount else 0
    val workId: UUID
    if (joins) workId = requireNotNull(existing).id
    else {
      val token = UUID.randomUUID().toString()
      synchronized(SplotchLibraryFiles.lock) {
        SplotchLibraryFiles.write(job, JSONObject().apply {
          put("marker", marker)
          put("identity", identity)
          put("allowMetered", allowMetered)
          put("token", token)
        }.toString())
      }
      val work = OneTimeWorkRequest.Builder(SplotchLibraryWorker::class.java)
        .setInputData(Data.Builder().putString(SplotchLibraryWorker.JOB_PATH, job.absolutePath)
          .putString(SplotchLibraryWorker.JOB_TOKEN, token).build())
        .setConstraints(Constraints.Builder()
          .setRequiredNetworkType(if (allowMetered) NetworkType.CONNECTED else NetworkType.UNMETERED).build())
        .addTag(WORK_TAG).build()
      manager.enqueueUniqueWork(WORK_TAG, ExistingWorkPolicy.REPLACE, work).result.get()
      workId = work.id
    }
    context.runOnUiQueueThread {
      val live = manager.getWorkInfoByIdLiveData(workId)
      var settled = false
      val subscription = UUID.randomUUID()
      lateinit var observer: Observer<WorkInfo?>
      observer = Observer { info ->
        if (info == null || settled) return@Observer
        val finished = info.state.isFinished
        val deferred = info.state == WorkInfo.State.ENQUEUED && info.runAttemptCount > joinedAttemptCount
        if (!finished && !deferred) return@Observer
        settled = true
        live.removeObserver(observer)
        observers.remove(subscription)
        if (info.state == WorkInfo.State.SUCCEEDED) promise.resolve(true)
        else {
          val dataSaver = SplotchLibraryWorker.dataSaverDefers(context, allowMetered)
          val code = info.outputData.getString("fault") ?: if (deferred && dataSaver) "library_metered" else "library_download"
          promise.reject(code, "Coloring download did not complete")
        }
      }
      observers[subscription] = workId to observer
      live.observeForever(observer)
    }
  }

  fun cancelAll() {
    synchronized(SplotchLibraryFiles.lock) {
      SplotchLibraryFiles.jobs(context).listFiles()?.forEach { check(it.delete()) }
    }
    manager.cancelAllWorkByTag(WORK_TAG).result.get()
  }

  fun invalidate() {
    context.runOnUiQueueThread {
      for ((id, observer) in observers.values) manager.getWorkInfoByIdLiveData(id).removeObserver(observer)
      observers.clear()
    }
  }
}
