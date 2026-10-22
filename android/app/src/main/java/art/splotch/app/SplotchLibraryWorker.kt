package art.splotch.app

import android.content.Context
import android.net.ConnectivityManager
import androidx.work.Data
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class SplotchLibraryWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
  companion object {
    const val JOB_PATH = "jobPath"
    const val JOB_TOKEN = "jobToken"
    private const val TRANSFER_TIMEOUT_MS = 30000
    private const val BUFFER_BYTES = 65536
    private const val STORAGE_RESERVE_BYTES = 8388608L

    fun dataSaverDefers(context: Context, allowMetered: Boolean): Boolean {
      val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      return dataSaverDefers(allowMetered, manager.isActiveNetworkMetered, manager.restrictBackgroundStatus)
    }

    // Data Saver restricts background data on metered networks only, so an unmetered network
    // never defers while restriction is on. ColoringPackWorker.java applies the same table,
    // pinned by tools/tests/native-data-saver-deferral.test.mjs.
    fun dataSaverDefers(allowMetered: Boolean, activeNetworkMetered: Boolean, restrictBackgroundStatus: Int): Boolean {
      return allowMetered && activeNetworkMetered && restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
    }
  }
  private class RetiredAsset : Exception()
  private class Cancelled : Exception()

  override fun doWork(): Result {
    val job = File(inputData.getString(JOB_PATH) ?: return Result.failure())
    val token = inputData.getString(JOB_TOKEN) ?: return Result.failure()
    return try {
      val root = SplotchLibraryFiles.root(applicationContext)
      require(job.canonicalPath.startsWith(File(root, "jobs").canonicalPath + File.separator))
      val stored = synchronized(SplotchLibraryFiles.lock) {
        if (!SplotchLibraryFiles.active(job, token)) throw Cancelled()
        JSONObject(job.readText())
      }
      val marker = stored.getString("marker")
      val identity = stored.getString("identity")
      val pack = SplotchLibraryFiles.parse(marker, identity)
      if (dataSaverDefers(applicationContext, stored.getBoolean("allowMetered"))) return Result.retry()
      val staging = SplotchLibraryFiles.stage(applicationContext, pack, token)
      val current = File(root, SplotchLibraryFiles.directory(pack))
      val files = pack.getJSONArray("files")
      prepareStaging(pack, current, staging, job, token)
      for (index in 0 until files.length()) {
        checkActive(job, token)
        val entry = files.getJSONObject(index)
        val destination = SplotchLibraryFiles.destination(staging, entry)
        if (!SplotchLibraryFiles.matches(destination, entry)) {
          if (root.usableSpace < entry.getLong("bytes") + STORAGE_RESERVE_BYTES)
            return Result.failure(Data.Builder().putString("fault", "library_storage_full").build())
          download(entry, destination, job, token)
        }
      }
      synchronized(SplotchLibraryFiles.lock) {
        checkActive(job, token)
        for (index in 0 until files.length())
          check(SplotchLibraryFiles.matches(SplotchLibraryFiles.destination(staging, files.getJSONObject(index)), files.getJSONObject(index)))
        SplotchLibraryFiles.write(File(staging, "identity.json"), identity)
        SplotchLibraryFiles.write(File(staging, "installed.json"), marker)
        check(!current.exists() || current.deleteRecursively())
        check(staging.renameTo(current))
        staging.parentFile?.deleteRecursively()
        check(job.delete())
      }
      Result.success()
    } catch (_: Cancelled) { Result.failure() }
    catch (_: RetiredAsset) { Result.failure() }
    catch (_: IllegalArgumentException) { Result.failure() }
    catch (_: Exception) { Result.retry() }
  }

  private fun prepareStaging(pack: JSONObject, current: File, staging: File, job: File, token: String) {
    synchronized(SplotchLibraryFiles.lock) {
      checkActive(job, token)
      val packStages = requireNotNull(staging.parentFile)
      val transfers = requireNotNull(packStages.parentFile)
      for (directory in transfers.listFiles().orEmpty())
        if (directory.name.startsWith("${pack.getString("id")}-") && directory != packStages)
          check(directory.deleteRecursively())
      val siblings = packStages.listFiles().orEmpty().filter { it != staging }
      val files = pack.getJSONArray("files")
      for (index in 0 until files.length()) {
        checkActive(job, token)
        val entry = files.getJSONObject(index)
        val destination = SplotchLibraryFiles.destination(staging, entry)
        if (SplotchLibraryFiles.matches(destination, entry)) continue
        val candidate = (listOf(current) + siblings).firstOrNull {
          SplotchLibraryFiles.matches(SplotchLibraryFiles.destination(it, entry), entry)
        } ?: continue
        val previous = SplotchLibraryFiles.destination(candidate, entry)
        check(destination.parentFile?.isDirectory == true || destination.parentFile?.mkdirs() == true)
        if (candidate == current) previous.copyTo(destination, overwrite = true)
        else {
          check(!destination.exists() || destination.delete())
          check(previous.renameTo(destination))
        }
      }
      for (directory in siblings) check(directory.deleteRecursively())
    }
  }

  private fun checkActive(job: File, token: String) {
    if (isStopped || !SplotchLibraryFiles.active(job, token)) throw Cancelled()
  }

  private fun download(entry: JSONObject, destination: File, job: File, token: String) {
    synchronized(SplotchLibraryFiles.lock) {
      checkActive(job, token)
      check(destination.parentFile?.isDirectory == true || destination.parentFile?.mkdirs() == true)
    }
    val temporary = File(destination.parentFile, "${destination.name}.part")
    val connection = URL("https://splotch.art${entry.getString("downloadPath")}").openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = false
    connection.connectTimeout = TRANSFER_TIMEOUT_MS
    connection.readTimeout = TRANSFER_TIMEOUT_MS
    try {
      if (connection.responseCode == 404 || connection.responseCode == 410) throw RetiredAsset()
      check(connection.responseCode == HttpURLConnection.HTTP_OK)
      var total = 0L
      connection.inputStream.buffered().use { input ->
        temporary.outputStream().buffered().use { output ->
          val buffer = ByteArray(BUFFER_BYTES)
          var count = input.read(buffer)
          while (count >= 0) {
            checkActive(job, token)
            total += count
            if (total > entry.getLong("bytes")) throw RetiredAsset()
            output.write(buffer, 0, count)
            count = input.read(buffer)
          }
        }
      }
      if (!SplotchLibraryFiles.matches(temporary, entry)) throw RetiredAsset()
      synchronized(SplotchLibraryFiles.lock) {
        checkActive(job, token)
        check(!destination.exists() || destination.delete())
        check(temporary.renameTo(destination))
      }
    } finally {
      connection.disconnect()
      temporary.delete()
    }
  }
}
