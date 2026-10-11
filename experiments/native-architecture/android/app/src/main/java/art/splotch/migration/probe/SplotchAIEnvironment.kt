package art.splotch.migration.probe

import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SplotchAIEnvironmentPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchAIEnvironment(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class SplotchAIEnvironment(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val alias = "splotch-ai-credentials-v1"
  private val maxBytes = 8192
  override fun getName() = "SplotchAIEnvironment"
  private fun slot(name: String): AtomicFile {
    require(name == "gemini-api-key" || name == "managed-access-code")
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
  private fun read(name: String): String? {
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
  private fun guarded(promise: Promise, operation: () -> Any?) {
    try { synchronized(this) { promise.resolve(operation()) } }
    catch (_: Exception) { promise.reject("AI_SECURE_UNAVAILABLE", "Secure AI storage is unavailable.") }
  }
  @ReactMethod fun installationId(promise: Promise) = guarded(promise) {
    val raw = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
    check(!raw.isNullOrBlank())
    MessageDigest.getInstance("SHA-256").digest("splotch-free-generation-v1:$raw".toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it.toInt() and 255) }
  }
  @ReactMethod fun readCredential(name: String, promise: Promise) = guarded(promise) { read(name) }
  @ReactMethod fun writeCredential(name: String, value: String, promise: Promise) = guarded(promise) {
    val plain = value.toByteArray(Charsets.UTF_8)
    check(plain.isNotEmpty() && plain.size <= maxBytes - 28)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key(true))
    val bytes = cipher.iv + cipher.doFinal(plain)
    val file = slot(name)
    val output = file.startWrite()
    try { output.write(bytes); file.finishWrite(output) }
    catch (error: Exception) { file.failWrite(output); throw error }
    check(read(name) == value)
    true
  }
  @ReactMethod fun removeCredential(name: String, promise: Promise) = guarded(promise) {
    slot(name).delete()
    check(read(name) == null)
    true
  }
}
