package art.splotch.app

import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.ColorSpace
import android.os.Build
import java.nio.ByteBuffer
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import org.json.JSONObject
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SplotchAIEnvironmentPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchAIEnvironment(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class SplotchAIEnvironment(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val journal = SplotchAIJournal(context)
  @ReactMethod fun aiStorage(kind: String, payload: String, promise: Promise) {
    journal.execute(kind, payload, { promise.resolve(it) }, { promise.reject("AI_DURABILITY_UNAVAILABLE", "AI storage was not confirmed. Nothing new was sent.") })
  }
  private val alias = "splotch-ai-credentials-v1"
  private val maxBytes = 8192
  private val maxCredentialBytes = 2048
  private val referenceBytes = 32
  private val protectedPrefix = "SPLOTCH-AI-VAULT-2\n"
  override fun getName() = "SplotchAIEnvironment"
  private fun slot(name: String): AtomicFile {
    require(name == "gemini-api-key" || name == "managed-access-code" || name == "free-generation-identity")
    return AtomicFile(File(context.noBackupFilesDir, "splotch-ai-$name.enc"))
  }
  private fun key(create: Boolean): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = store.getKey(alias, null)
    if (existing is SecretKey) return existing
    check(create)
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).setRandomizedEncryptionRequired(true).build())
    }.generateKey()
  }
  private fun readStored(name: String): String? {
    val file = slot(name)
    if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return null
    val bytes = file.openRead().use { input ->
      val output = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        check(output.size() + count <= maxBytes)
        output.write(buffer, 0, count)
      }
      output.toByteArray()
    }
    check(bytes.size in 29..maxBytes)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8).also { check(it.isNotBlank()) }
  }
  private fun protectedRecord(name: String): JSONObject? {
    val stored = readStored(name) ?: return null
    if (!stored.startsWith(protectedPrefix)) return null
    val value = JSONObject(stored.removePrefix(protectedPrefix))
    check(value.keys().asSequence().toSet() == setOf("version", "reference", "value"))
    check(value.get("version") is Number && (value.get("version") as Number).toDouble() == 2.0)
    check(value.get("reference") is String && value.get("value") is String)
    check(Regex("[a-f0-9]{64}").matches(value.getString("reference")))
    check(value.getString("value").isNotEmpty())
    return value
  }
  private fun read(name: String): String? {
    val stored = readStored(name) ?: return null
    return if (stored.startsWith(protectedPrefix)) protectedRecord(name)!!.getString("value") else stored
  }
  private fun installationValue(): String {
    val raw = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
    check(!raw.isNullOrBlank())
    return MessageDigest.getInstance("SHA-256").digest("splotch-free-generation-v1:$raw".toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it.toInt() and 255) }
  }
  private fun writeProtected(name: String, value: String): String {
    val reference = ByteArray(referenceBytes).also { SecureRandom().nextBytes(it) }
      .joinToString("") { "%02x".format(it.toInt() and 255) }
    check(protectedRecord(name)?.getString("reference") != reference)
    val record = JSONObject().put("version", 2).put("reference", reference).put("value", value)
    val plain = (protectedPrefix + record.toString()).toByteArray(Charsets.UTF_8)
    check(plain.isNotEmpty() && plain.size <= maxBytes - 28)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key(true))
    val bytes = cipher.iv + cipher.doFinal(plain)
    val file = slot(name)
    val output = file.startWrite()
    try { output.write(bytes); file.finishWrite(output) }
    catch (error: Exception) { file.failWrite(output); throw error }
    val confirmed = protectedRecord(name) ?: error("Secure publication unavailable")
    check(confirmed.getString("reference") == reference && confirmed.getString("value") == value)
    return reference
  }
  @ReactMethod fun pinCredentialReference(name: String, promise: Promise) = guarded(promise) {
    val value = if (name == "free-generation-identity") installationValue() else read(name)
    check(!value.isNullOrBlank())
    val current = protectedRecord(name)
    if (current != null && current.getString("value") == value) current.getString("reference")
    else writeProtected(name, value)
  }
  @ReactMethod fun readReferencedCredential(name: String, reference: String, promise: Promise) = guarded(promise) {
    check(Regex("[a-f0-9]{64}").matches(reference))
    val current = protectedRecord(name) ?: error("Credential reference unavailable")
    check(current.getString("reference") == reference)
    val value = current.getString("value")
    if (name == "free-generation-identity") check(value == installationValue())
    value
  }
  private fun guarded(promise: Promise, operation: () -> Any?) {
    try { synchronized(this) { promise.resolve(operation()) } }
    catch (_: Exception) { promise.reject("AI_SECURE_UNAVAILABLE", "Secure AI storage is unavailable.") }
  }
  @ReactMethod fun installationId(promise: Promise) = guarded(promise) { installationValue() }
  @ReactMethod fun readCredential(name: String, promise: Promise) = guarded(promise) {
    check(name == "gemini-api-key" || name == "managed-access-code")
    read(name)
  }
  @ReactMethod fun writeCredential(name: String, value: String, promise: Promise) = guarded(promise) {
    check(name == "gemini-api-key" || name == "managed-access-code")
    check(value.isNotBlank() && value.toByteArray(Charsets.UTF_8).size <= maxCredentialBytes)
    writeProtected(name, value)
    true
  }
  @ReactMethod fun writeReferencedCredential(name: String, value: String, promise: Promise) = guarded(promise) {
    check(name == "gemini-api-key" || name == "managed-access-code")
    check(value.isNotBlank() && value.toByteArray(Charsets.UTF_8).size <= maxCredentialBytes)
    writeProtected(name, value)
  }
  @ReactMethod fun removeCredential(name: String, promise: Promise) = guarded(promise) {
    check(name == "gemini-api-key" || name == "managed-access-code")
    slot(name).delete()
    check(read(name) == null)
    true
  }
  @ReactMethod fun decodeImage(base64: String, mime: String, width: Double, height: Double, purpose: String, promise: Promise) {
    try {
      synchronized(this) {
        check(width.isFinite() && height.isFinite() && width == width.toInt().toDouble() && height == height.toInt().toDouble())
        check(purpose == "result" || purpose == "original")
        check(purpose != "original" || mime == "image/png")
        val maxPixels = if (purpose == "original") SplotchAIImageDecoder.maxOriginalPixels else SplotchAIImageDecoder.maxImagePixels
        val maxDimension = if (purpose == "original") maxPixels else SplotchAIImageDecoder.maxImageDimension
        check(width >= 1 && height >= 1 && width <= maxDimension && height <= maxDimension && width * height <= maxPixels)
        check(base64.length <= ((SplotchAIImageDecoder.maxImageBytes + 2) / 3) * 4)
        val bytes = Base64.decode(base64, Base64.NO_WRAP)
        check(Base64.encodeToString(bytes, Base64.NO_WRAP) == base64)
        val dimensions = if (purpose == "original") SplotchAIImageDecoder.decodeOriginal(bytes) else SplotchAIImageDecoder.decode(bytes, mime)
        check(dimensions.first == width.toInt() && dimensions.second == height.toInt())
        promise.resolve(Arguments.createMap().apply { putInt("width", dimensions.first); putInt("height", dimensions.second) })
      }
    } catch (_: Exception) { promise.reject("AI_IMAGE_REJECTED", "AI picture decoding failed.") }
    catch (_: OutOfMemoryError) { promise.reject("AI_IMAGE_REJECTED", "AI picture decoding failed.") }
  }
}

internal object SplotchAIImageDecoder {
  const val maxImageBytes = 16 * 1024 * 1024
  const val maxImageDimension = 4096
  const val maxImagePixels = 4 * 1024 * 1024
  const val maxOriginalPixels = 16 * 1024 * 1024
  private const val maxPngChunks = 4096
  private const val maxJpegSegments = 1024
  private const val maxWebpChunks = 8
  private fun structure(bytes: ByteArray, mime: String) {
    fun u(index: Int) = bytes[index].toInt() and 255
    fun text(start: Int, count: Int) = String(bytes, start, count, Charsets.US_ASCII)
    fun be(start: Int) = (0..3).fold(0L) { value, index -> (value shl 8) or u(start + index).toLong() }
    fun le(start: Int) = (0..3).fold(0L) { value, index -> value or (u(start + index).toLong() shl (8 * index)) }
    when (mime) {
      "image/png" -> {
        check(bytes.size >= 33 && bytes.take(8).map { it.toInt() and 255 } == listOf(137, 80, 78, 71, 13, 10, 26, 10))
        var offset = 8; var chunks = 0; var dataSeen = false; var ended = false
        while (offset < bytes.size) {
          check(++chunks <= maxPngChunks && offset <= bytes.size - 12 && !ended)
          val length = be(offset); val type = text(offset + 4, 4)
          check(length <= bytes.size - offset - 12)
          val end = offset + length.toInt() + 12
          val crc = java.util.zip.CRC32().apply { update(bytes, offset + 4, length.toInt() + 4) }.value
          check(crc == be(end - 4))
          when {
            chunks == 1 -> check(type == "IHDR" && length == 13L && u(offset + 16) == 8 && u(offset + 17) in setOf(2, 6) && u(offset + 18) == 0 && u(offset + 19) == 0 && u(offset + 20) == 0)
            type == "IDAT" -> dataSeen = true
            type == "IEND" -> { check(length == 0L && dataSeen && end == bytes.size); ended = true }
            else -> check(!dataSeen && type in setOf("cHRM", "gAMA", "sRGB", "sBIT", "pHYs", "PLTE", "caBX"))
          }
          offset = end
        }
        check(ended)
      }
      "image/jpeg" -> {
        check(bytes.size >= 4 && u(0) == 255 && u(1) == 0xd8)
        var offset = 2; var segments = 0; var entropy = false; var scanned = false; var ended = false
        while (offset < bytes.size) {
          check(offset + 1 < bytes.size && u(offset) == 255)
          val marker = u(offset + 1); offset += 2
          if (entropy && (marker == 0 || marker in 0xd0..0xd7)) {
            while (offset < bytes.size && u(offset) != 255) offset++
            continue
          }
          entropy = false
          if (marker == 0xd9) { check(scanned && offset == bytes.size); ended = true; break }
          check(++segments <= maxJpegSegments && offset + 1 < bytes.size)
          val length = u(offset) * 256 + u(offset + 1)
          check(length >= 2 && length <= bytes.size - offset)
          check(marker in setOf(0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd, 0xda, 0xfe) || marker in 0xe0..0xef)
          offset += length
          if (marker == 0xda) { entropy = true; scanned = true }
          while (entropy && offset < bytes.size && u(offset) != 255) offset++
        }
        check(ended)
      }
      "image/webp" -> {
        check(bytes.size >= 20 && text(0, 4) == "RIFF" && text(8, 4) == "WEBP" && le(4) == (bytes.size - 8).toLong())
        var offset = 12; val seen = mutableSetOf<String>(); var picture = false
        while (offset < bytes.size) {
          check(offset <= bytes.size - 8 && seen.size < maxWebpChunks)
          val type = text(offset, 4); val length = le(offset + 4)
          check(type !in seen && length <= bytes.size - offset - 8)
          val end = offset + length.toInt() + 8; val pad = length.toInt() and 1
          check(end + pad <= bytes.size && (pad == 0 || u(end) == 0))
          when (type) {
            "VP8X" -> check(offset == 12 && length == 10L && u(offset + 8) and 0xc3 == 0)
            "VP8 ", "VP8L" -> { check(!picture && length > 0); picture = true }
            else -> check(type in setOf("ALPH", "ICCP", "EXIF", "XMP "))
          }
          seen.add(type); offset = end + pad
        }
        check(picture)
      }
      else -> error("Image MIME unavailable")
    }
  }
  @android.annotation.TargetApi(28)
  private fun completeBitmap(bytes: ByteArray, mime: String, width: Int, height: Int): Bitmap =
    ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, info, _ ->
      check(info.size.width == width && info.size.height == height && info.mimeType == mime && !info.isAnimated)
      decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE)
      decoder.setMemorySizePolicy(ImageDecoder.MEMORY_POLICY_DEFAULT)
      decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
      decoder.setOnPartialImageListener { false }
    }
  fun decode(bytes: ByteArray, mime: String): Pair<Int, Int> = decode(bytes, mime, maxImagePixels, maxImageDimension)
  fun decodeOriginal(bytes: ByteArray): Pair<Int, Int> = decode(bytes, "image/png", maxOriginalPixels, maxOriginalPixels)
  private fun decode(bytes: ByteArray, mime: String, pixelLimit: Int, dimensionLimit: Int): Pair<Int, Int> {
    val maxDecodedBytes = pixelLimit * 4
    check(bytes.isNotEmpty() && bytes.size <= maxImageBytes)
    structure(bytes, mime)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val width = bounds.outWidth; val height = bounds.outHeight
    check(width in 1..dimensionLimit && height in 1..dimensionLimit && width.toLong() * height <= pixelLimit && bounds.outMimeType == mime)
    check(Build.VERSION.SDK_INT >= 28 || mime != "image/webp")
    val options = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888; inSampleSize = 1; inScaled = false }
    val bitmap = if (Build.VERSION.SDK_INT >= 28) completeBitmap(bytes, mime, width, height)
      else BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    check(bitmap != null)
    try {
      check(bitmap.width == width && bitmap.height == height && bitmap.allocationByteCount <= maxDecodedBytes && bitmap.config == Bitmap.Config.ARGB_8888)
      bitmap.getPixel(width - 1, height - 1)
      return width to height
    } finally { bitmap.recycle() }
  }
}
