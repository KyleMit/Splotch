package art.splotch.migration.probe

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
  private val maxImageBytes = 16 * 1024 * 1024
  private val maxImageDimension = 4096
  private val maxImagePixels = 4 * 1024 * 1024
  private val maxDecodedBytes = maxImagePixels * 4
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
  @android.annotation.TargetApi(28)
  private fun completeBitmap(bytes: ByteArray, mime: String, width: Int, height: Int): Bitmap {
    return ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, info, _ ->
      check(info.size.width == width && info.size.height == height && info.mimeType == mime && !info.isAnimated)
      decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE)
      decoder.setMemorySizePolicy(ImageDecoder.MEMORY_POLICY_DEFAULT)
      decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
      decoder.setOnPartialImageListener { false }
    }
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
  @ReactMethod fun decodeImage(base64: String, mime: String, width: Double, height: Double, promise: Promise) {
    try {
      synchronized(this) {
        check(mime == "image/png" || mime == "image/jpeg" || mime == "image/webp")
        check(width.isFinite() && height.isFinite() && width == width.toInt().toDouble() && height == height.toInt().toDouble())
        check(width >= 1 && height >= 1 && width <= maxImageDimension && height <= maxImageDimension && width * height <= maxImagePixels)
        check(base64.length <= ((maxImageBytes + 2) / 3) * 4)
        val bytes = Base64.decode(base64, Base64.NO_WRAP)
        check(bytes.isNotEmpty() && bytes.size <= maxImageBytes)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        check(bounds.outWidth == width.toInt() && bounds.outHeight == height.toInt() && bounds.outMimeType == mime)
        val options = BitmapFactory.Options().apply {
          inPreferredConfig = Bitmap.Config.ARGB_8888
          inSampleSize = 1
          inScaled = false
        }
        check(Build.VERSION.SDK_INT >= 28 || mime != "image/webp")
        val bitmap = if (Build.VERSION.SDK_INT >= 28) completeBitmap(bytes, mime, width.toInt(), height.toInt())
          else BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        check(bitmap != null)
        try {
          check(bitmap.width == width.toInt() && bitmap.height == height.toInt() && bitmap.allocationByteCount <= maxDecodedBytes)
          check(bitmap.config == Bitmap.Config.ARGB_8888)
          bitmap.getPixel(bitmap.width - 1, bitmap.height - 1)
          promise.resolve(Arguments.createMap().apply { putInt("width", bitmap.width); putInt("height", bitmap.height) })
        } finally { bitmap.recycle() }
      }
    } catch (_: Exception) { promise.reject("AI_IMAGE_REJECTED", "AI picture decoding failed.") }
    catch (_: OutOfMemoryError) { promise.reject("AI_IMAGE_REJECTED", "AI picture decoding failed.") }
  }
}
