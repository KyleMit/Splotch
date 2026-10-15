package art.splotch.migration.probe

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

internal object SplotchLibraryFiles {
  val lock = Any()
  const val MAX_FILE_BYTES = 2097152L
  private const val MAX_PACK_BYTES = 16777216L
  private const val PACK_FILE_COUNT = 74
  private const val HASH_BUFFER_BYTES = 65536
  private val digest = Regex("^[a-f0-9]{64}$")

  fun root(context: Context): File = File(context.filesDir, "splotch-offline-library-v1").apply {
    check(isDirectory || mkdirs()) { "Coloring storage is unavailable" }
  }

  fun parse(marker: String, identity: String): JSONObject {
    val pack = JSONObject(marker)
    val id = pack.getString("id")
    require(Regex("^[a-z]+$").matches(id))
    require(digest.matches(pack.getString("revision")))
    require(sha256(identity.toByteArray(Charsets.UTF_8)) == pack.getString("revision"))
    val files = JSONArray(identity)
    val declared = pack.getJSONArray("files")
    require(files.length() == PACK_FILE_COUNT && declared.length() == files.length())
    val names = mutableSetOf<String>()
    var total = 0L
    for (index in 0 until files.length()) {
      val entry = files.getJSONObject(index)
      val named = declared.getJSONObject(index)
      val path = entry.getString("path")
      val download = entry.getString("downloadPath")
      require(Regex("^/coloring/$id/[a-z0-9.-]+$").matches(path) && !path.contains(".."))
      require(download == path ||
        (Regex("\\.(light|night)\\.webp$").containsMatchIn(path) &&
          download == path.replace("/coloring/", "/coloring/max-1152px/")))
      require(names.add(path))
      val bytes = entry.getLong("bytes")
      require(bytes > 0 && bytes <= MAX_FILE_BYTES && entry.getDouble("bytes") == bytes.toDouble())
      require(digest.matches(entry.getString("sha256")))
      for (key in listOf("path", "downloadPath", "bytes", "sha256")) require(entry.get(key) == named.get(key))
      total += bytes
    }
    require(total > 0 && total <= MAX_PACK_BYTES && pack.getLong("bytes") == total)
    return pack
  }

  fun directory(pack: JSONObject) = "${pack.getString("id")}-${pack.getString("revision")}"
  fun jobs(context: Context) = File(root(context), "jobs").apply { check(isDirectory || mkdirs()) }
  fun stage(context: Context, pack: JSONObject, token: String) = File(root(context), "transfers/${directory(pack)}/$token")
  fun destination(directory: File, entry: JSONObject) = File(directory, "files/${entry.getString("path").substringAfterLast('/')}")

  fun matches(file: File, entry: JSONObject): Boolean =
    file.isFile && file.length() == entry.getLong("bytes") && sha256(file) == entry.getString("sha256")

  fun sha256(file: File): String {
    val hash = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(HASH_BUFFER_BYTES)
      var count = input.read(buffer)
      while (count >= 0) { hash.update(buffer, 0, count); count = input.read(buffer) }
    }
    return hash.digest().joinToString("") { "%02x".format(it) }
  }

  private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes).joinToString("") { "%02x".format(it) }

  fun write(file: File, text: String) {
    check(file.parentFile?.isDirectory == true || file.parentFile?.mkdirs() == true)
    val temporary = File(file.parentFile, "${file.name}.pending")
    temporary.writeText(text, Charsets.UTF_8)
    check(temporary.renameTo(file)) { "Coloring storage could not be published" }
  }

  fun active(job: File, token: String): Boolean =
    job.isFile && runCatching { JSONObject(job.readText()).getString("token") == token }.getOrDefault(false)
}
