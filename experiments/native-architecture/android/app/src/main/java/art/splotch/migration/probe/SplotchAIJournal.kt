package art.splotch.migration.probe

import android.content.Context
import android.system.Os
import android.system.OsConstants
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.Executors

class SplotchAIJournal(private val context: Context) {
  private val executor = Executors.newSingleThreadExecutor()
  private val root get() = File(context.noBackupFilesDir, "splotch-ai-journal-v1")
  private val maxModel = 8 * 1024 * 1024
  private val maxUpload = 15 * 1024 * 1024
  private val maxResult = 16 * 1024 * 1024
  private val maxJournal = 32 * 1024
  private val maxQuota = 128L * 1024 * 1024
  private val maxAttempts = 32
  private val maxLegacy = 256
  private val safeInteger = 9007199254740991L
  private val styles = setOf("Magical", "Crayon", "Watercolor", "Paper", "Felt", "Sticker", "Cartoon", "Clay")
  fun execute(kind: String, payload: String, success: (String) -> Unit, failure: () -> Unit) {
    executor.execute {
      try {
        check(payload.toByteArray(Charsets.UTF_8).size <= maxModel + ((maxUpload + 2) / 3) * 4 + maxJournal)
        directory(root, context.noBackupFilesDir)
        val lock = File(root, "owner.lock")
        val fd = Os.open(lock.path, OsConstants.O_RDWR or OsConstants.O_CREAT or OsConstants.O_NOFOLLOW, 384)
        try {
        checkFile(fd)
        val response = FileOutputStream(fd).use { stream ->
          stream.channel.lock().use {
            stream.fd.sync()
            fence(root)
            val output = dispatch(kind, JSONObject(payload))
            check(output.toByteArray(Charsets.UTF_8).size <= maxJournal)
            output
          }
        }
        success(response)
        } finally { if (fd.valid()) Os.close(fd) }
      } catch (_: Exception) { failure() }
      catch (_: OutOfMemoryError) { failure() }
    }
  }
  private fun keys(value: JSONObject, vararg names: String) {
    check(value.keys().asSequence().toSet() == names.toSet())
  }
  private fun integer(value: JSONObject, name: String, minimum: Long = 1): Long {
    val raw = value.get(name)
    check(raw is Number && raw !is Float && raw.toDouble().isFinite())
    val number = raw.toLong()
    check(raw.toDouble() == number.toDouble() && number in minimum..safeInteger)
    return number
  }
  private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun checkFile(fd: java.io.FileDescriptor) {
    val stat = Os.fstat(fd)
    check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_uid == android.os.Process.myUid())
  }
  private fun fence(dir: File) {
    val fd = Os.open(dir.path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
    try {
      val stat = Os.fstat(fd)
      check(OsConstants.S_ISDIR(stat.st_mode) && stat.st_uid == android.os.Process.myUid())
      Os.fsync(fd)
    } finally { Os.close(fd) }
  }
  private fun directory(dir: File, parent: File) {
    if (!dir.exists()) Os.mkdir(dir.path, 448)
    val stat = Os.lstat(dir.path)
    check(OsConstants.S_ISDIR(stat.st_mode) && stat.st_uid == android.os.Process.myUid())
    Os.chmod(dir.path, 448)
    fence(parent)
    fence(dir)
  }
  private fun read(file: File, limit: Int): ByteArray {
    val fd = Os.open(file.path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
    try {
      checkFile(fd)
      check(Os.fstat(fd).st_size in 1..limit.toLong())
      return FileInputStream(fd).use { input ->
        val result = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          check(result.size() + count <= limit)
          result.write(buffer, 0, count)
        }
        result.toByteArray()
      }
    } catch (error: Exception) { if (fd.valid()) Os.close(fd); throw error }
  }
  private fun atomic(dir: File, name: String, bytes: ByteArray) {
    check(bytes.isNotEmpty())
    val final = File(dir, name)
    if (final.exists()) {
      check(read(final, bytes.size).contentEquals(bytes))
      val fd = Os.open(final.path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
      try { checkFile(fd); Os.fsync(fd) } finally { Os.close(fd) }
      fence(dir)
      return
    }
    val pending = File(dir, "$name.pending")
    val fd = Os.open(pending.path, OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL or OsConstants.O_NOFOLLOW, 384)
    try {
      checkFile(fd)
      FileOutputStream(fd).use { stream -> stream.write(bytes); stream.flush(); stream.fd.sync() }
    } catch (error: Exception) { if (fd.valid()) Os.close(fd); throw error }
    check(read(pending, bytes.size).contentEquals(bytes))
    check(!final.exists())
    Os.rename(pending.path, final.path)
    fence(dir)
  }
  private fun journal(value: JSONObject): JSONObject {
    keys(value, "version", "id", "createdAt", "style", "originalId", "phase", "jobId", "result")
    check(integer(value, "version") == 1L)
    integer(value, "id"); integer(value, "createdAt", 0)
    check(styles.contains(value.getString("style")))
    check(Regex("picture-[0-9]+-[a-z0-9]+").matches(value.getString("originalId")))
    val phase = value.getString("phase")
    check(phase in setOf("sent", "pending", "unknown", "result", "failed"))
    check(value.isNull("jobId") || Regex("[a-f0-9]{64}").matches(value.getString("jobId")))
    check(phase != "pending" || !value.isNull("jobId"))
    check((phase == "result") == !value.isNull("result"))
    if (!value.isNull("result")) {
      val result = value.getJSONObject("result")
      keys(result, "uri", "mime")
      check(result.getString("mime") in setOf("image/png", "image/jpeg", "image/webp"))
    }
    check(value.toString().toByteArray().size <= maxJournal / 2)
    return value
  }
  private fun metadata(bytes: ByteArray) = JSONObject().put("bytes", bytes.size).put("sha256", digest(bytes))
  private fun verify(dir: File, name: String, meta: JSONObject, cap: Int) {
    keys(meta, "bytes", "sha256")
    val bytes = read(File(dir, name), cap)
    check(integer(meta, "bytes") == bytes.size.toLong() && meta.getString("sha256") == digest(bytes))
  }
  private fun attempts(): List<File> {
    val entries = root.listFiles() ?: error("Storage unavailable")
    check(entries.size <= maxAttempts + 1)
    return entries.filter { it.name != "owner.lock" }.onEach {
      check(Regex("attempt-[0-9]+").matches(it.name))
      val stat = Os.lstat(it.path)
      check(OsConstants.S_ISDIR(stat.st_mode) && stat.st_uid == android.os.Process.myUid())
    }
  }
  private fun latest(dir: File): JSONObject {
    val files = dir.listFiles() ?: error("Storage unavailable")
    check(files.size <= 12)
    files.forEach {
      check(Regex("(original|upload|result)\\.bin(\\.pending)?|journal-[0-9]+\\.json(\\.pending)?").matches(it.name))
      val stat = Os.lstat(it.path)
      check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_uid == android.os.Process.myUid())
    }
    val revisions = files.filter { Regex("journal-[0-9]+\\.json").matches(it.name) }
      .sortedByDescending { it.name.removePrefix("journal-").removeSuffix(".json").toLong() }
    check(revisions.isNotEmpty() && revisions.size <= 3)
    val values = revisions.map { file ->
      val value = JSONObject(String(read(file, maxJournal), Charsets.UTF_8))
      keys(value, "schema", "nonce", "revision", "journal", "original", "upload", "result")
      check(integer(value, "schema") == 1L && Regex("[a-f0-9]{64}").matches(value.getString("nonce")))
      check(integer(value, "revision") == file.name.removePrefix("journal-").removeSuffix(".json").toLong())
      val j = journal(value.getJSONObject("journal"))
      check(dir.name == "attempt-${integer(j, "id")}")
      verify(dir, "original.bin", value.getJSONObject("original"), maxModel)
      if (!value.isNull("upload")) verify(dir, "upload.bin", value.getJSONObject("upload"), maxUpload)
      if (!value.isNull("result")) {
        verify(dir, "result.bin", value.getJSONObject("result"), maxResult)
        check(j.getJSONObject("result").getString("uri") == File(dir, "result.bin").toURI().toString())
      }
      check(value.isNull("result") == j.isNull("result"))
      value
    }
    val first = values.first()
    values.forEachIndexed { index, value ->
      check(value.getString("nonce") == first.getString("nonce") && value.getLong("revision") == first.getLong("revision") - index)
      for (key in listOf("version", "id", "createdAt", "style", "originalId")) check(value.getJSONObject("journal").get(key) == first.getJSONObject("journal").get(key))
    }
    return first
  }
  private fun confirm(dir: File, value: JSONObject): JSONObject {
    atomic(dir, "original.bin", read(File(dir, "original.bin"), maxModel))
    if (!value.isNull("upload")) atomic(dir, "upload.bin", read(File(dir, "upload.bin"), maxUpload))
    if (!value.isNull("result")) atomic(dir, "result.bin", read(File(dir, "result.bin"), maxResult))
    val name = "journal-${value.getLong("revision")}.json"
    atomic(dir, name, read(File(dir, name), maxJournal))
    fence(dir)
    return value
  }
  private fun receipt(value: JSONObject): JSONObject = JSONObject().put("journal", value.getJSONObject("journal"))
    .put("nonce", value.getString("nonce")).put("revision", value.getLong("revision"))
    .put("originalDigest", value.getJSONObject("original").getString("sha256"))
    .put("inputDigest", if (value.isNull("upload")) JSONObject.NULL else value.getJSONObject("upload").getString("sha256"))
  private fun unresolved(value: JSONObject) = value.getJSONObject("journal").getString("phase") !in setOf("result", "failed")
  private fun quota(extra: Long, replacing: File? = null) {
    var size = 0L
    for (dir in attempts()) {
      for (file in dir.listFiles() ?: error("Storage unavailable")) {
        val stat = Os.lstat(file.path)
        check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_size in 0..maxQuota)
        size += stat.st_size
      }
      if (dir != replacing && unresolved(latest(dir))) size += maxResult + maxJournal * 2L
    }
    val legacy = File(context.filesDir, "splotch-ai-pictures-v1")
    if (legacy.exists()) {
      check(OsConstants.S_ISDIR(Os.lstat(legacy.path).st_mode))
      val files = legacy.listFiles() ?: error("Legacy unavailable")
      check(files.size <= maxLegacy)
      files.forEach {
        val stat = Os.lstat(it.path)
        check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_size in 0..maxQuota)
        size += stat.st_size
      }
    }
    check(size + extra <= maxQuota)
  }
  private fun publish(dir: File, value: JSONObject): JSONObject {
    val bytes = value.toString().toByteArray(Charsets.UTF_8)
    check(bytes.size <= maxJournal)
    atomic(dir, "journal-${value.getLong("revision")}.json", bytes)
    val old = (dir.listFiles() ?: error("Storage unavailable")).filter { Regex("journal-[0-9]+\\.json").matches(it.name) }
      .sortedByDescending { it.name.removePrefix("journal-").removeSuffix(".json").toLong() }.drop(2)
    old.forEach { Os.unlink(it.path) }
    fence(dir)
    return JSONObject().put("receipt", receipt(confirm(dir, latest(dir))))
  }
  private fun decode(value: JSONObject, key: String, cap: Int): ByteArray {
    val encoded = value.getString(key)
    check(encoded.length <= ((cap + 2) / 3) * 4 && Regex("[A-Za-z0-9+/]*={0,2}").matches(encoded))
    return Base64.decode(encoded, Base64.NO_WRAP).also {
      check(it.isNotEmpty() && it.size <= cap && Base64.encodeToString(it, Base64.NO_WRAP) == encoded)
    }
  }
  private fun same(a: JSONObject, b: JSONObject): Boolean {
    if (a.keys().asSequence().toSet() != b.keys().asSequence().toSet()) return false
    return a.keys().asSequence().all { key ->
      val x = a.get(key); val y = b.get(key)
      if (x is JSONObject && y is JSONObject) same(x, y) else x == y
    }
  }
  private fun dispatch(kind: String, input: JSONObject): String {
    val output = when (kind) {
      "read" -> {
        keys(input)
        val all = attempts().map { confirm(it, latest(it)) }
        JSONObject().put("receipt", all.maxByOrNull { it.getJSONObject("journal").getLong("id") }?.let { receipt(it) } ?: JSONObject.NULL)
      }
      "pictures" -> {
        keys(input)
        val pictures = org.json.JSONArray()
        attempts().map { confirm(it, latest(it)) }.forEach { if (!it.isNull("result")) pictures.put(it.getJSONObject("journal").getJSONObject("result")) }
        JSONObject().put("pictures", pictures)
      }
      "prepare", "importLegacy" -> {
        if (kind == "prepare") keys(input, "journal", "originalModel", "upload") else keys(input, "journal", "originalModel")
        val j = journal(input.getJSONObject("journal"))
        check(j.isNull("result") && (kind != "prepare" || (j.getString("phase") == "sent" && j.isNull("jobId"))))
        val all = attempts()
        check(all.size < maxAttempts && all.none { unresolved(latest(it)) })
        val original = input.getString("originalModel").toByteArray(Charsets.UTF_8)
        check(original.isNotEmpty() && original.size <= maxModel && JSONObject(String(original)).getInt("version") == 5)
        val upload = if (kind == "prepare") decode(input, "upload", maxUpload) else null
        quota(original.size + (upload?.size ?: 0) + maxResult + maxJournal * 2L)
        val dir = File(root, "attempt-${integer(j, "id")}")
        check(!dir.exists()); directory(dir, root)
        atomic(dir, "original.bin", original)
        if (upload != null) atomic(dir, "upload.bin", upload)
        val nonce = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it.toInt() and 255) }
        publish(dir, JSONObject().put("schema", 1).put("nonce", nonce).put("revision", 1).put("journal", j)
          .put("original", metadata(original)).put("upload", upload?.let { metadata(it) } ?: JSONObject.NULL).put("result", JSONObject.NULL))
      }
      "write", "retain" -> {
        if (kind == "write") keys(input, "id", "nonce", "revision", "journal") else keys(input, "id", "nonce", "revision", "bytes", "mime")
        val dir = File(root, "attempt-${integer(input, "id")}")
        check(attempts().contains(dir))
        val value = latest(dir)
        check(input.getString("nonce") == value.getString("nonce"))
        val previous = value.getJSONObject("journal")
        if (kind == "write") {
          check(integer(input, "revision") == value.getLong("revision"))
          val next = journal(input.getJSONObject("journal"))
          for (key in listOf("version", "id", "createdAt", "style", "originalId")) check(next.get(key) == previous.get(key))
          check(previous.isNull("jobId") || previous.get("jobId") == next.get("jobId"))
          val allowed = when (previous.getString("phase")) {
            "sent" -> setOf("sent", "pending", "unknown", "failed")
            "pending" -> setOf("pending", "unknown", "failed")
            "unknown" -> setOf("unknown", "pending", "failed")
            "failed" -> setOf("failed", "pending")
            else -> setOf("result")
          }
          check(next.getString("phase") in allowed)
          check(next.isNull("result") == previous.isNull("result"))
          if (!previous.isNull("result")) check(same(previous.getJSONObject("result"), next.getJSONObject("result")))
          if (same(previous, next)) JSONObject().put("receipt", receipt(confirm(dir, value))) else {
            quota(maxJournal.toLong())
            value.put("journal", next).put("revision", value.getLong("revision") + 1)
            publish(dir, value)
          }
        } else {
          val bytes = decode(input, "bytes", maxResult)
          val mime = input.getString("mime")
          check(mime in setOf("image/png", "image/jpeg", "image/webp"))
          if (!value.isNull("result")) {
            check(value.getJSONObject("result").getString("sha256") == digest(bytes) && previous.getJSONObject("result").getString("mime") == mime)
            atomic(dir, "result.bin", bytes)
            JSONObject().put("receipt", receipt(confirm(dir, value)))
          } else {
            check(integer(input, "revision") == value.getLong("revision"))
            quota(bytes.size + maxJournal.toLong(), dir)
            atomic(dir, "result.bin", bytes)
            previous.put("phase", "result").put("result", JSONObject().put("uri", File(dir, "result.bin").toURI().toString()).put("mime", mime))
            value.put("journal", previous).put("result", metadata(bytes)).put("revision", value.getLong("revision") + 1)
            publish(dir, value)
          }
        }
      }
      else -> error("Unknown storage operation")
    }
    return output.toString()
  }
}
