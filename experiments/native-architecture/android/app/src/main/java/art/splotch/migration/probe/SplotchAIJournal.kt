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
  private val currentOriginalVersions = setOf(5L, 6L, 7L)
  private val importedOriginalVersions = setOf(1L, 2L, 3L, 4L, 5L, 6L, 7L)
  private val maxDrawingContacts = 1000
  private val maxDrawingSamples = 100000
  private val maxRecordedOps = maxDrawingSamples * 2
  private val drawingRainbowCount = 10L
  private val maxAllocationCursor = 4294967296L
  private val drawingPaperWidth = 1024.0
  private val drawingPaperHeight = 768.0
  private val maximumBackingScale = 2.0
  private val maxUpload = 15 * 1024 * 1024
  private val maxResult = 16 * 1024 * 1024
  private val maxJournal = 32 * 1024
  private val maxUploadReply = ((maxUpload + 2) / 3) * 4 + maxJournal
  private val maxQuota = 128L * 1024 * 1024
  private val maxAttempts = 32
  private val maxLegacy = 256
  private val safeInteger = 9007199254740991L
  private val minimumRecoveryExpiryDeltaMs = 1170000L
  private val maximumRecoveryExpiryDeltaMs = 1260000L
  private val recoveryPollAfterMs = 4000L
  private val maxRecoveryJson = 8192
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
            check(output.toByteArray(Charsets.UTF_8).size <= if (kind in setOf("readPreparedUpload", "readRecoveryUpload")) maxUploadReply else maxJournal)
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
  private fun recovery(value: JSONObject): JSONObject {
    val r = value.getJSONObject("recovery")
    keys(r, "version", "protocol", "id", "credential", "expiry", "intent")
    check(integer(r, "version") == 2L && r.getString("protocol") == "splotch-ai-recovery-v1")
    val j = journal(value.getJSONObject("journal"))
    check(j.getString("phase") == "unknown" && j.isNull("jobId") && j.isNull("result"))
    check(!value.isNull("upload") && value.isNull("result"))
    val nonce = value.getString("nonce")
    val created = integer(j, "createdAt", 0)
    val envelope = "[\"splotch-ai-recovery-v1\",\"$nonce\",$created]".toByteArray(Charsets.UTF_8)
    check(r.getString("id") == digest(envelope))
    val credential = r.getJSONObject("credential")
    keys(credential, "kind", "reference")
    check(credential.getString("kind") in setOf("free", "managed", "byok"))
    check(Regex("[a-f0-9]{64}").matches(credential.getString("reference")))
    check(r.getString("intent") in setOf("prepared", "committed"))
    val expiry = r.getJSONObject("expiry")
    if (expiry.getString("kind") == "unknown") keys(expiry, "kind") else {
      keys(expiry, "kind", "expiresAt", "provenance")
      check(expiry.getString("provenance") == "admitted-status-202")
      check(expiry.getString("kind") == "known" && r.getString("intent") == "committed")
      check(created <= safeInteger - maximumRecoveryExpiryDeltaMs)
      check(integer(expiry, "expiresAt") - created in minimumRecoveryExpiryDeltaMs..maximumRecoveryExpiryDeltaMs)
    }
    return r
  }
  private fun recoveryProgress(older: JSONObject, newer: JSONObject) {
    check(integer(older, "schema") == integer(newer, "schema"))
    if (integer(older, "schema") == 3L) { requestProgress(older, newer); return }
    if (integer(older, "schema") != 2L) return
    val a = recovery(older); val b = recovery(newer)
    for (key in listOf("version", "protocol", "id")) check(a.get(key) == b.get(key))
    check(same(a.getJSONObject("credential"), b.getJSONObject("credential")))
    check(a.getString("intent") != "committed" || b.getString("intent") == "committed")
    val expiry = a.getJSONObject("expiry")
    check(expiry.getString("kind") != "known" || same(expiry, b.getJSONObject("expiry")))
    for (key in listOf("original", "upload")) check(same(older.getJSONObject(key), newer.getJSONObject(key)))
  }
  private fun latest(dir: File): JSONObject {
    val files = dir.listFiles() ?: error("Storage unavailable")
    check(files.size <= 12)
    files.forEach {
      check(Regex("(original|upload|result)\\.bin(\\.pending)?|journal-[0-9]+\\.json(\\.pending)?").matches(it.name))
      val stat = Os.lstat(it.path)
      check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_uid == android.os.Process.myUid())
    }
    check(files.none { it.name.endsWith(".json.pending") })
    val revisions = files.filter { Regex("journal-[0-9]+\\.json").matches(it.name) }
      .sortedByDescending { it.name.removePrefix("journal-").removeSuffix(".json").toLong() }
    check(revisions.isNotEmpty() && revisions.size <= 3)
    val values = revisions.map { file ->
      val value = JSONObject(String(read(file, maxJournal), Charsets.UTF_8))
      val schema = integer(value, "schema")
      check(schema == 1L || schema == 2L || schema == 3L)
      if (schema == 1L) keys(value, "schema", "nonce", "revision", "journal", "original", "upload", "result")
      else keys(value, "schema", "nonce", "revision", "journal", "original", "upload", "result", "recovery")
      check(Regex("[a-f0-9]{64}").matches(value.getString("nonce")))
      if (schema == 2L) recovery(value)
      if (schema == 3L) recoveryRequest(value)
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
    if (integer(first, "schema") == 3L) {
      check(files.none { it.name in setOf("original.bin.pending", "upload.bin.pending") })
      sourceHeld(first)
      val r = first.getJSONObject("recovery"); val state = r.getString("state")
      val final = files.any { it.name == "result.bin" }; val pending = files.any { it.name == "result.bin.pending" }
      check(!final || !pending)
      if (pending) check(Os.lstat(File(dir, "result.bin.pending").path).st_size in 0..maxResult.toLong())
      if (state == "delivery-pinned" && final) {
        val d = delivery(r.getJSONObject("delivery"))
        verify(dir, "result.bin", JSONObject().put("bytes", integer(d, "length")).put("sha256", d.getString("digest")), maxResult)
      }
      if (state !in setOf("delivery-pinned", "retained", "acknowledged")) {
        check(files.none { it.name == "result.bin" || it.name == "result.bin.pending" })
      }
    }
    values.forEachIndexed { index, value ->
      recoveryProgress(value, first)
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
    if (integer(value, "schema") == 3L) {
      val (source, held) = sourceHeld(value)
      confirm(source, held)
      val r = value.getJSONObject("recovery")
      if (r.has("delivery") && File(dir, "result.bin").exists()) {
        val d = delivery(r.getJSONObject("delivery"))
        val bytes = read(File(dir, "result.bin"), maxResult)
        check(digest(bytes) == d.getString("digest") && bytes.size.toLong() == integer(d, "length"))
        SplotchAIImageDecoder.decode(bytes, d.getString("mime"))
        atomic(dir, "result.bin", bytes)
      }
      check(same(latest(dir), value))
    }
    return value
  }
  private fun receipt(value: JSONObject): JSONObject = JSONObject().put("kind", if (integer(value, "schema") == 3L) "recovery-request" else if (integer(value, "schema") == 2L) "recovery-held" else if (value.isNull("upload")) "imported" else "prepared")
    .put("journal", value.getJSONObject("journal")).put("originalRevision", 1)
    .put("nonce", value.getString("nonce")).put("revision", value.getLong("revision"))
    .put("originalDigest", value.getJSONObject("original").getString("sha256"))
    .put("inputDigest", if (value.isNull("upload")) JSONObject.NULL else value.getJSONObject("upload").getString("sha256"))
    .put("inputLength", if (value.isNull("upload")) JSONObject.NULL else value.getJSONObject("upload").getLong("bytes"))
    .put("resultDigest", if (value.isNull("result")) JSONObject.NULL else value.getJSONObject("result").getString("sha256"))
    .put("resultLength", if (value.isNull("result")) JSONObject.NULL else value.getJSONObject("result").getLong("bytes"))
    .also {
      if (integer(value, "schema") == 2L) it.put("recovery", recovery(value))
      if (integer(value, "schema") == 3L) it.put("recovery", recoveryRequest(value))
    }
  private fun unresolved(value: JSONObject) = integer(value, "schema") == 2L || value.getJSONObject("journal").getString("phase") !in setOf("result", "failed")
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
    old.forEach {
      val stat = Os.lstat(it.path)
      check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L)
      Os.remove(it.path)
    }
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
  private fun originalModel(bytes: ByteArray, importing: Boolean) {
    check(bytes.isNotEmpty() && bytes.size <= maxModel)
    val value = JSONObject(String(bytes, Charsets.UTF_8))
    val version = integer(value, "version")
    check(version in (if (importing) importedOriginalVersions else currentOriginalVersions))
    val expected = when (version) {
      1L -> setOf("version", "strokes")
      2L -> if (value.has("pageId")) setOf("version", "pageId", "strokes") else setOf("version", "rainbow", "strokes")
      3L, 4L, 5L -> setOf("version", "pageId", "rainbow", "strokes")
      6L -> setOf("version", "paper", "pageId", "rainbow", "strokes")
      7L -> setOf("version", "paper", "pageId", "rainbow", "seedCursor", "commands")
      else -> error("Original drawing version unavailable")
    }
    check(value.keys().asSequence().toSet() == expected)
    if (value.has("pageId")) check(value.get("pageId") is String && value.getString("pageId").isNotEmpty())
    if (value.has("rainbow")) check(integer(value, "rainbow", 0) < drawingRainbowCount)
    val count: Int
    if (version == 7L) {
      val highWater = integer(value, "seedCursor")
      check(highWater <= maxAllocationCursor)
      val commands = value.getJSONArray("commands")
      check(commands.length() <= maxDrawingContacts)
      var contacts = 0
      var previous = 1L
      for (index in 0 until commands.length()) {
        val command = commands.getJSONObject(index)
        keys(command, "firstSeed", "granularity", "styles", "moves", "ops")
        val firstSeed = integer(command, "firstSeed")
        check(firstSeed in previous..highWater)
        previous = firstSeed
        check(command.get("granularity") is String && command.getString("granularity") in setOf("per-move", "per-frame"))
        val styles = command.getJSONArray("styles")
        contacts += styles.length()
        check(styles.length() > 0 && contacts <= maxDrawingContacts)
        val moves = command.getJSONArray("moves")
        val ops = command.getJSONArray("ops")
        check(moves.length() <= maxDrawingSamples && ops.length() <= maxRecordedOps)
        for (entry in 0 until styles.length()) styles.getJSONObject(entry)
        for (entry in 0 until moves.length()) moves.getJSONObject(entry)
        for (entry in 0 until ops.length()) ops.getJSONObject(entry)
      }
      count = commands.length()
    } else {
      val strokes = value.getJSONArray("strokes")
      check(strokes.length() <= maxDrawingContacts)
      var points = 0
      for (index in 0 until strokes.length()) {
        val stroke = strokes.getJSONObject(index)
        val samples = stroke.getJSONArray("points")
        points += samples.length()
        check(samples.length() > 0 && points <= maxDrawingSamples)
        for (entry in 0 until samples.length()) samples.getJSONObject(entry)
      }
      count = strokes.length()
    }
    if (version >= 6L) {
      val paper = value.getJSONObject("paper")
      if (paper.get("kind") == "unadopted") { keys(paper, "kind"); check(count == 0) }
      else {
        keys(paper, "kind", "cssWidth", "cssHeight", "backingScale")
        check(paper.get("kind") == "adopted")
        for ((name, maximum) in listOf("cssWidth" to drawingPaperWidth, "cssHeight" to drawingPaperHeight, "backingScale" to maximumBackingScale)) {
          val raw = paper.get(name)
          check(raw is Number && raw.toDouble().isFinite() && raw.toDouble() > 0 && raw.toDouble() <= maximum)
        }
        val scale = minOf(paper.getDouble("cssWidth") / drawingPaperWidth, paper.getDouble("cssHeight") / drawingPaperHeight)
        check((drawingPaperWidth / scale / paper.getDouble("backingScale")).isFinite())
      }
    }
  }
  private fun exactStrings(value: JSONObject, vararg names: String) {
    names.forEach { check(value.get(it) is String) }
  }
  private fun recoveryRequest(value: JSONObject): JSONObject {
    val r = value.getJSONObject("recovery"); val j = journal(value.getJSONObject("journal"))
    exactStrings(value, "nonce"); exactStrings(r, "protocol", "id", "state")
    exactStrings(j, "style", "originalId", "phase")
    val state = r.getString("state"); val deliveryStates = setOf("delivery-pinned", "retained", "acknowledged")
    check(state in deliveryStates || state in setOf("prepared", "submission-uncertain", "admitted", "terminal"))
    val expected = listOf("version", "protocol", "id", "credential", "sourceHeld", "state", "expiry") +
      if (state in deliveryStates) listOf("delivery") else if (state == "terminal") listOf("outcome") else emptyList()
    keys(r, *expected.toTypedArray())
    check(integer(r, "version") == 3L && r.getString("protocol") == "splotch-ai-recovery-v1")
    val nonce = value.getString("nonce"); val created = integer(j, "createdAt", 0)
    check(r.getString("id") == digest("[\"splotch-ai-recovery-v1\",\"$nonce\",$created]".toByteArray(Charsets.UTF_8)))
    val credential = r.getJSONObject("credential"); keys(credential, "kind", "reference")
    exactStrings(credential, "kind", "reference")
    check(credential.getString("kind") in setOf("free", "managed", "byok") && Regex("[a-f0-9]{64}").matches(credential.getString("reference")))
    val source = r.getJSONObject("sourceHeld"); keys(source, "id", "nonce", "revision")
    exactStrings(source, "nonce")
    check(integer(source, "id") < integer(j, "id") && Regex("[a-f0-9]{64}").matches(source.getString("nonce")))
    integer(source, "revision")
    check(!value.isNull("upload") && j.isNull("jobId"))
    val expiry = r.getJSONObject("expiry"); exactStrings(expiry, "kind")
    for (key in listOf("original", "upload")) exactStrings(value.getJSONObject(key), "sha256")
    if (state in setOf("prepared", "submission-uncertain")) {
      keys(expiry, "kind"); check(expiry.getString("kind") == "unknown")
    } else {
      keys(expiry, "kind", "expiresAt", "provenance"); exactStrings(expiry, "provenance")
      check(expiry.getString("kind") == "known" && expiry.getString("provenance") == "validated-recovery-response")
      check(created <= safeInteger - maximumRecoveryExpiryDeltaMs)
      check(integer(expiry, "expiresAt") - created in minimumRecoveryExpiryDeltaMs..maximumRecoveryExpiryDeltaMs)
    }
    if (state in deliveryStates) {
      val d = delivery(r.getJSONObject("delivery"))
      check(integer(d, "expiresAt") == integer(expiry, "expiresAt"))
      if (state in setOf("retained", "acknowledged")) {
        check(j.getString("phase") == "result" && !value.isNull("result"))
        val result = value.getJSONObject("result"); exactStrings(result, "sha256")
        exactStrings(j.getJSONObject("result"), "uri", "mime")
        check(result.getString("sha256") == d.getString("digest") && integer(result, "bytes") == integer(d, "length"))
        check(j.getJSONObject("result").getString("mime") == d.getString("mime"))
      }
    }
    if (state !in setOf("retained", "acknowledged")) {
      check(value.isNull("result") && j.isNull("result") && j.getString("phase") == (if (state == "terminal") "failed" else "unknown"))
    }
    if (state == "terminal") { exactStrings(r, "outcome"); check(r.getString("outcome") in setOf("refusal", "error", "expired")) }
    return r
  }
  private fun delivery(d: JSONObject): JSONObject {
    keys(d, "expiresAt", "digest", "receipt", "mime", "length")
    exactStrings(d, "digest", "receipt", "mime")
    integer(d, "expiresAt")
    check(Regex("[a-f0-9]{64}").matches(d.getString("digest")) && Regex("[a-f0-9]{64}").matches(d.getString("receipt")))
    check(d.getString("mime") in setOf("image/png", "image/jpeg", "image/webp") && integer(d, "length") <= maxResult)
    return d
  }
  private fun requestProgress(older: JSONObject, newer: JSONObject) {
    val a = recoveryRequest(older); val b = recoveryRequest(newer)
    for (key in listOf("version", "protocol", "id")) check(a.get(key) == b.get(key))
    for (key in listOf("credential", "sourceHeld")) check(same(a.getJSONObject(key), b.getJSONObject(key)))
    for (key in listOf("original", "upload")) check(same(older.getJSONObject(key), newer.getJSONObject(key)))
    val expiry = a.getJSONObject("expiry")
    check(expiry.getString("kind") != "known" || same(expiry, b.getJSONObject("expiry")))
    if (a.has("delivery")) check(same(a.getJSONObject("delivery"), b.getJSONObject("delivery")))
    if (!older.isNull("result")) check(same(older.getJSONObject("result"), newer.getJSONObject("result")))
    val state = a.getString("state"); val next = b.getString("state")
    val allowed = when (state) {
      "prepared" -> setOf("prepared", "submission-uncertain", "admitted", "delivery-pinned", "retained", "acknowledged", "terminal")
      "submission-uncertain" -> setOf("submission-uncertain", "admitted", "delivery-pinned", "retained", "acknowledged", "terminal")
      "admitted" -> setOf("admitted", "delivery-pinned", "retained", "acknowledged", "terminal")
      "delivery-pinned" -> setOf("delivery-pinned", "retained", "acknowledged")
      "retained" -> setOf("retained", "acknowledged")
      "acknowledged" -> setOf("acknowledged")
      else -> setOf("terminal")
    }
    check(next in allowed)
    if (state == "terminal") check(a.getString("outcome") == b.getString("outcome"))
  }
  private fun sourceHeld(value: JSONObject): Pair<File, JSONObject> {
    val r = recoveryRequest(value); val selector = r.getJSONObject("sourceHeld")
    val dir = File(root, "attempt-${integer(selector, "id")}")
    check(attempts().contains(dir))
    val held = latest(dir)
    check(integer(held, "schema") == 2L && held.getString("nonce") == selector.getString("nonce") && integer(held, "revision") == integer(selector, "revision"))
    val j = journal(value.getJSONObject("journal")); val old = journal(held.getJSONObject("journal"))
    check(integer(j, "createdAt", 0) > integer(old, "createdAt", 0))
    for (key in listOf("style", "originalId")) check(j.getString(key) == old.getString(key))
    for (key in listOf("original", "upload")) check(same(value.getJSONObject(key), held.getJSONObject(key)))
    return dir to held
  }
  private fun selectedRequest(input: JSONObject): Pair<File, JSONObject> {
    exactStrings(input, "nonce")
    val id = integer(input, "id")
    val all = confirmedAttempts()
    val value = all.find { integer(it.getJSONObject("journal"), "id") == id } ?: error("Recovery attempt unavailable")
    val dir = File(root, "attempt-$id")
    check(integer(value, "schema") == 3L && input.getString("nonce") == value.getString("nonce") && integer(input, "revision") == integer(value, "revision"))
    return dir to value
  }
  private fun publishRequest(dir: File, before: JSONObject, next: JSONObject): JSONObject {
    recoveryRequest(next); requestProgress(before, next)
    if (same(before, next)) return JSONObject().put("receipt", receipt(confirm(dir, next)))
    check(integer(before, "revision") < safeInteger)
    val terminal = next.getJSONObject("recovery").getString("state") in setOf("terminal", "retained", "acknowledged")
    quota(maxJournal.toLong(), if (terminal) dir else null)
    next.put("revision", integer(before, "revision") + 1)
    return publish(dir, next)
  }
  private fun prepareRecoverySend(input: JSONObject): JSONObject {
    keys(input, "source", "id", "createdAt", "credential")
    val selector = input.getJSONObject("source"); keys(selector, "id", "nonce", "revision")
    exactStrings(selector, "nonce")
    val all = attempts(); val confirmed = confirmedAttempts()
    val id = integer(input, "id"); val created = integer(input, "createdAt", 0)
    check(all.size < maxAttempts)
    for (value in confirmed) {
      val schema = integer(value, "schema")
      check(integer(value.getJSONObject("journal"), "id") < id && integer(value.getJSONObject("journal"), "createdAt", 0) < created)
      check(schema == 2L || !unresolved(value))
    }
    val source = File(root, "attempt-${integer(selector, "id")}")
    check(all.contains(source))
    val held = confirm(source, latest(source))
    check(integer(held, "schema") == 2L && selector.getString("nonce") == held.getString("nonce") && integer(selector, "revision") == integer(held, "revision"))
    val j = JSONObject(journal(held.getJSONObject("journal")).toString())
    check(created > integer(j, "createdAt", 0))
    j.put("id", id).put("createdAt", created)
    val original = read(File(source, "original.bin"), maxModel); val upload = read(File(source, "upload.bin"), maxUpload)
    originalModel(original, false)
    SplotchAIImageDecoder.decode(upload, "image/png")
    quota(original.size + upload.size + maxResult + maxJournal * 2L)
    val nonce = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it.toInt() and 255) }
    confirmed.forEach { check(it.getString("nonce") != nonce) }
    val r = JSONObject().put("version", 3).put("protocol", "splotch-ai-recovery-v1")
      .put("id", digest("[\"splotch-ai-recovery-v1\",\"$nonce\",$created]".toByteArray(Charsets.UTF_8)))
      .put("credential", input.getJSONObject("credential")).put("sourceHeld", selector)
      .put("state", "prepared").put("expiry", JSONObject().put("kind", "unknown"))
    val value = JSONObject().put("schema", 3).put("nonce", nonce).put("revision", 1).put("journal", j)
      .put("original", metadata(original)).put("upload", metadata(upload)).put("result", JSONObject.NULL).put("recovery", r)
    recoveryRequest(value)
    val dir = File(root, "attempt-$id")
    check(!dir.exists()); directory(dir, root)
    atomic(dir, "original.bin", original); atomic(dir, "upload.bin", upload)
    return publish(dir, value)
  }
  private fun recoveryAdmission(dir: File, value: JSONObject, status: JSONObject): JSONObject {
    keys(status, "kind", "protocol", "id", "expiresAt", "phase", "pollAfterMs", "headerExpiresAt")
    exactStrings(status, "kind", "protocol", "id", "phase", "headerExpiresAt")
    val next = JSONObject(value.toString()); val r = recoveryRequest(next)
    check(r.getString("state") != "prepared" && status.getString("kind") == "status" && status.getString("protocol") == r.getString("protocol") && status.getString("id") == r.getString("id"))
    val phase = status.getString("phase"); val expiry = integer(status, "expiresAt")
    check(phase in setOf("preparing", "funded", "pending", "working", "image", "delivery", "refusal", "error", "acknowledged") && integer(status, "pollAfterMs") == recoveryPollAfterMs && status.getString("headerExpiresAt") == expiry.toString())
    val known = JSONObject().put("kind", "known").put("expiresAt", expiry).put("provenance", "validated-recovery-response")
    check(r.getJSONObject("expiry").getString("kind") == "unknown" || same(r.getJSONObject("expiry"), known))
    r.put("expiry", known)
    val state = r.getString("state")
    if (state in setOf("submission-uncertain", "admitted")) r.put("state", "admitted")
    return publishRequest(dir, value, next)
  }
  private fun recoveryTerminal(input: JSONObject): JSONObject {
    keys(input, "id", "nonce", "revision", "confirmation")
    val (dir, value) = selectedRequest(input)
    val r = recoveryRequest(value)
    val state = r.getString("state")
    check(state in setOf("submission-uncertain", "admitted", "terminal"))
    val confirmation = input.getJSONObject("confirmation"); keys(confirmation, "status", "body")
    val body = confirmation.getJSONObject("body")
    keys(body, "ok", "error", "code", "protocol", "id", "createdAt", "expiresAt", "outcome")
    exactStrings(body, "error", "code", "protocol", "id", "outcome")
    check(body.get("ok") is Boolean && !body.getBoolean("ok"))
    check(body.getString("error").isNotEmpty() && body.getString("error").toByteArray(Charsets.UTF_8).size <= maxRecoveryJson)
    check(body.getString("code") == "RECOVERY_TERMINAL" && body.getString("protocol") == r.getString("protocol") && body.getString("id") == r.getString("id"))
    check(integer(body, "createdAt", 0) == integer(value.getJSONObject("journal"), "createdAt", 0))
    val outcome = body.getString("outcome")
    val status = when (outcome) { "expired" -> 410L; "refusal" -> 422L; "error" -> 502L; else -> error("Terminal outcome unavailable") }
    check(integer(confirmation, "status") == status)
    val known = JSONObject().put("kind", "known").put("expiresAt", integer(body, "expiresAt")).put("provenance", "validated-recovery-response")
    check(r.getJSONObject("expiry").getString("kind") == "unknown" || same(r.getJSONObject("expiry"), known))
    if (state == "terminal") check(r.getString("outcome") == outcome)
    check(same(confirm(dir, latest(dir)), value))
    val next = JSONObject(value.toString())
    next.getJSONObject("recovery").put("expiry", known).put("state", "terminal").put("outcome", outcome)
    next.getJSONObject("journal").put("phase", "failed")
    return publishRequest(dir, value, next)
  }
  private fun recoveryResultFile(dir: File, bytes: ByteArray) {
    val final = File(dir, "result.bin"); val pending = File(dir, "result.bin.pending")
    if (final.exists()) { check(!pending.exists()); atomic(dir, "result.bin", bytes); return }
    if (pending.exists()) {
      val stat = Os.lstat(pending.path)
      check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_uid == android.os.Process.myUid() && stat.st_size in 0..maxResult.toLong())
      if (stat.st_size > 0 && read(pending, maxResult).contentEquals(bytes)) {
        val fd = Os.open(pending.path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW, 0)
        try {
          checkFile(fd); Os.fsync(fd)
          check(!final.exists()); Os.rename(pending.path, final.path); fence(dir)
        } finally { Os.close(fd) }
        return
      }
      Os.remove(pending.path); fence(dir)
    }
    atomic(dir, "result.bin", bytes)
  }
  private fun retainRecovery(input: JSONObject): JSONObject {
    keys(input, "id", "nonce", "revision", "delivery", "bytes")
    exactStrings(input, "bytes")
    val (dir, initial) = selectedRequest(input)
    var value = initial; var r = recoveryRequest(value)
    val d = delivery(input.getJSONObject("delivery")); val bytes = decode(input, "bytes", maxResult)
    check(r.getString("state") !in setOf("prepared", "terminal"))
    check(integer(d, "length") == bytes.size.toLong() && d.getString("digest") == digest(bytes))
    SplotchAIImageDecoder.decode(bytes, d.getString("mime"))
    check(same(confirm(dir, latest(dir)), value))
    val known = JSONObject().put("kind", "known").put("expiresAt", integer(d, "expiresAt")).put("provenance", "validated-recovery-response")
    check(r.getJSONObject("expiry").getString("kind") == "unknown" || same(r.getJSONObject("expiry"), known))
    if (r.has("delivery")) check(same(r.getJSONObject("delivery"), d)) else {
      val pinned = JSONObject(value.toString())
      pinned.getJSONObject("recovery").put("expiry", known).put("delivery", d).put("state", "delivery-pinned")
      publishRequest(dir, value, pinned)
      value = confirm(dir, latest(dir)); r = recoveryRequest(value)
    }
    if (r.getString("state") in setOf("retained", "acknowledged")) {
      check(read(File(dir, "result.bin"), maxResult).contentEquals(bytes))
      return JSONObject().put("receipt", receipt(confirm(dir, value)))
    }
    var storedBytes = 0L
    for (name in listOf("result.bin", "result.bin.pending")) {
      val file = File(dir, name)
      if (file.exists()) {
        val stat = Os.lstat(file.path)
        check(OsConstants.S_ISREG(stat.st_mode) && stat.st_nlink == 1L && stat.st_uid == android.os.Process.myUid() && stat.st_size in 0..maxResult.toLong())
        storedBytes += stat.st_size
      }
    }
    quota(maxOf(0L, bytes.size - storedBytes) + maxJournal, dir)
    recoveryResultFile(dir, bytes)
    check(read(File(dir, "result.bin"), maxResult).contentEquals(bytes))
    val next = JSONObject(value.toString())
    next.getJSONObject("recovery").put("state", "retained")
    next.getJSONObject("journal").put("phase", "result").put("result", JSONObject().put("uri", File(dir, "result.bin").toURI().toString()).put("mime", d.getString("mime")))
    next.put("result", metadata(bytes))
    return publishRequest(dir, value, next)
  }
  private fun acknowledgeRecovery(input: JSONObject): JSONObject {
    keys(input, "id", "nonce", "revision", "confirmation")
    val (dir, value) = selectedRequest(input); val r = recoveryRequest(value)
    check(r.getString("state") in setOf("retained", "acknowledged"))
    val d = delivery(r.getJSONObject("delivery")); val confirmation = input.getJSONObject("confirmation")
    keys(confirmation, "status", "body"); check(integer(confirmation, "status") == 200L)
    val body = confirmation.getJSONObject("body")
    keys(body, "ok", "protocol", "id", "phase", "expiresAt", "deliveryDigest", "deliveryReceipt")
    exactStrings(body, "protocol", "id", "phase", "deliveryDigest", "deliveryReceipt")
    check(body.get("ok") is Boolean && body.getBoolean("ok"))
    check(body.getString("protocol") == r.getString("protocol") && body.getString("id") == r.getString("id") && body.getString("phase") == "acknowledged" && integer(body, "expiresAt") == integer(d, "expiresAt") && body.getString("deliveryDigest") == d.getString("digest") && body.getString("deliveryReceipt") == d.getString("receipt"))
    val bytes = read(File(dir, "result.bin"), maxResult)
    check(digest(bytes) == d.getString("digest") && bytes.size.toLong() == integer(d, "length"))
    SplotchAIImageDecoder.decode(bytes, d.getString("mime"))
    check(same(confirm(dir, latest(dir)), value))
    val next = JSONObject(value.toString()); next.getJSONObject("recovery").put("state", "acknowledged")
    return publishRequest(dir, value, next)
  }
  private fun confirmedAttempts(): List<JSONObject> {
    val values = attempts().map { confirm(it, latest(it)) }
    if (values.any { integer(it, "schema") == 3L }) {
      check(values.count { integer(it, "schema") != 2L && unresolved(it) } <= 1)
    }
    return values
  }
  private fun dispatch(kind: String, input: JSONObject): String {
    val output = when (kind) {
      "prepareRecoverySendFromHeld" -> prepareRecoverySend(input)
      "retainRecoveryResult" -> retainRecovery(input)
      "recordAck" -> acknowledgeRecovery(input)
      "recordRecoveryTerminal" -> recoveryTerminal(input)
      "readRecoveryAttempt" -> {
        keys(input, "id")
        val id = integer(input, "id")
        val all = confirmedAttempts()
        val value = all.find { integer(it.getJSONObject("journal"), "id") == id }
        if (value != null) check(integer(value, "schema") in setOf(2L, 3L))
        JSONObject().put("receipt", value?.let { receipt(it) } ?: JSONObject.NULL)
      }
      "markRecoverySubmission", "readRecoveryUpload", "recordRecoveryAdmission" -> {
        if (kind == "recordRecoveryAdmission") keys(input, "id", "nonce", "revision", "status") else keys(input, "id", "nonce", "revision")
        val (dir, value) = selectedRequest(input)
        val r = recoveryRequest(value)
        when (kind) {
          "readRecoveryUpload" -> {
            check(r.getString("state") == "submission-uncertain")
            val bytes = read(File(dir, "upload.bin"), maxUpload)
            val meta = value.getJSONObject("upload")
            check(integer(meta, "bytes") == bytes.size.toLong() && meta.getString("sha256") == digest(bytes))
            SplotchAIImageDecoder.decode(bytes, "image/png")
            check(same(confirm(dir, latest(dir)), value))
            JSONObject().put("receipt", receipt(value)).put("upload", Base64.encodeToString(bytes, Base64.NO_WRAP))
          }
          "recordRecoveryAdmission" -> recoveryAdmission(dir, value, input.getJSONObject("status"))
          else -> {
            check(r.getString("state") in setOf("prepared", "submission-uncertain"))
            val next = JSONObject(value.toString()); next.getJSONObject("recovery").put("state", "submission-uncertain")
            publishRequest(dir, value, next)
          }
        }
      }
      "read" -> {
        keys(input)
        val all = confirmedAttempts()
        JSONObject().put("receipt", all.maxByOrNull { it.getJSONObject("journal").getLong("id") }?.let { receipt(it) } ?: JSONObject.NULL)
      }
      "pictures" -> {
        keys(input)
        val pictures = org.json.JSONArray()
        confirmedAttempts().forEach { if (!it.isNull("result")) pictures.put(it.getJSONObject("journal").getJSONObject("result")) }
        JSONObject().put("pictures", pictures)
      }
      "readPreparedUpload" -> {
        keys(input, "id", "nonce", "revision")
        val dir = File(root, "attempt-${integer(input, "id")}")
        check(attempts().contains(dir))
        val pinned = confirm(dir, latest(dir))
        check(input.getString("nonce") == pinned.getString("nonce") && integer(input, "revision") == pinned.getLong("revision"))
        check(integer(pinned, "schema") == 1L && !pinned.isNull("upload"))
        val bytes = read(File(dir, "upload.bin"), maxUpload)
        val meta = pinned.getJSONObject("upload")
        check(integer(meta, "bytes") == bytes.size.toLong() && meta.getString("sha256") == digest(bytes))
        JSONObject().put("receipt", receipt(pinned)).put("upload", Base64.encodeToString(bytes, Base64.NO_WRAP))
      }
      "prepare", "importLegacy", "prepareRecovery" -> {
        if (kind == "prepareRecovery") keys(input, "journal", "originalModel", "upload", "credential")
        else if (kind == "prepare") keys(input, "journal", "originalModel", "upload") else keys(input, "journal", "originalModel")
        val j = journal(input.getJSONObject("journal"))
        check(j.isNull("result") && (kind != "prepare" || (j.getString("phase") == "sent" && j.isNull("jobId"))))
        if (kind == "prepareRecovery") {
          check(j.getString("phase") == "unknown" && j.isNull("jobId"))
          val credential = input.getJSONObject("credential")
          keys(credential, "kind", "reference")
          check(credential.getString("kind") in setOf("free", "managed", "byok") && Regex("[a-f0-9]{64}").matches(credential.getString("reference")))
        }
        val all = attempts()
        check(all.size < maxAttempts && all.none { unresolved(latest(it)) })
        val original = input.getString("originalModel").toByteArray(Charsets.UTF_8)
        originalModel(original, kind == "importLegacy")
        val upload = if (kind != "importLegacy") decode(input, "upload", maxUpload) else null
        quota(original.size + (upload?.size ?: 0) + maxResult + maxJournal * 2L)
        val dir = File(root, "attempt-${integer(j, "id")}")
        check(!dir.exists()); directory(dir, root)
        atomic(dir, "original.bin", original)
        if (upload != null) atomic(dir, "upload.bin", upload)
        val nonce = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it.toInt() and 255) }
        val value = JSONObject().put("schema", if (kind == "prepareRecovery") 2 else 1).put("nonce", nonce).put("revision", 1).put("journal", j)
          .put("original", metadata(original)).put("upload", upload?.let { metadata(it) } ?: JSONObject.NULL).put("result", JSONObject.NULL)
        if (kind == "prepareRecovery") {
          val created = integer(j, "createdAt", 0)
          val envelope = "[\"splotch-ai-recovery-v1\",\"$nonce\",$created]".toByteArray(Charsets.UTF_8)
          value.put("recovery", JSONObject().put("version", 2).put("protocol", "splotch-ai-recovery-v1")
            .put("id", digest(envelope)).put("credential", input.getJSONObject("credential"))
            .put("expiry", JSONObject().put("kind", "unknown")).put("intent", "prepared"))
          recovery(value)
        }
        publish(dir, value)
      }
      "commitRecoveryIntent", "recordRecoveryStatus" -> {
        if (kind == "commitRecoveryIntent") keys(input, "id", "nonce", "revision") else keys(input, "id", "nonce", "revision", "status")
        val dir = File(root, "attempt-${integer(input, "id")}")
        check(attempts().contains(dir))
        val value = latest(dir)
        check(integer(value, "schema") == 2L && input.getString("nonce") == value.getString("nonce") && integer(input, "revision") == integer(value, "revision"))
        val before = JSONObject(value.toString())
        val r = recovery(value)
        if (kind == "commitRecoveryIntent") r.put("intent", "committed") else {
          check(r.getString("intent") == "committed")
          val status = input.getJSONObject("status")
          keys(status, "kind", "protocol", "id", "expiresAt", "phase", "pollAfterMs", "headerExpiresAt")
          check(status.getString("kind") == "status" && status.getString("protocol") == r.getString("protocol") && status.getString("id") == r.getString("id"))
          check(status.getString("phase") in setOf("preparing", "funded", "pending", "working", "image", "delivery", "refusal", "error", "acknowledged"))
          check(integer(status, "pollAfterMs") == recoveryPollAfterMs)
          val expiry = integer(status, "expiresAt")
          check(status.getString("headerExpiresAt") == expiry.toString())
          val known = JSONObject().put("kind", "known").put("expiresAt", expiry).put("provenance", "admitted-status-202")
          check(r.getJSONObject("expiry").getString("kind") == "unknown" || same(r.getJSONObject("expiry"), known))
          r.put("expiry", known)
        }
        recovery(value); recoveryProgress(before, value)
        if (same(before, value)) JSONObject().put("receipt", receipt(confirm(dir, value))) else {
          for (candidate in attempts()) {
            val existing = latest(candidate)
            if (integer(existing, "schema") == 3L) check(integer(existing.getJSONObject("recovery").getJSONObject("sourceHeld"), "id") != integer(input, "id"))
          }
          check(integer(value, "revision") < safeInteger)
          quota(maxJournal.toLong())
          value.put("revision", value.getLong("revision") + 1)
          publish(dir, value)
        }
      }
      "write", "retain" -> {
        if (kind == "write") keys(input, "id", "nonce", "revision", "journal") else keys(input, "id", "nonce", "revision", "bytes", "mime")
        val dir = File(root, "attempt-${integer(input, "id")}")
        check(attempts().contains(dir))
        val value = latest(dir)
        check(integer(value, "schema") == 1L)
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
