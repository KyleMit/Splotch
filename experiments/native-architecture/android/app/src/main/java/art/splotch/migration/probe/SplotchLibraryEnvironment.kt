package art.splotch.migration.probe

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

class SplotchLibraryEnvironment(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val MAX_FILE_BYTES = 2097152
  private val HASH_BUFFER_BYTES = 65536
  private val executor = Executors.newSingleThreadExecutor()
  private val root = File(context.filesDir, "splotch-offline-library-v1")
  override fun getName() = "SplotchLibraryEnvironment"

  @ReactMethod
  fun environment(promise: Promise) {
    executor.execute {
      try {
        if (!root.exists() && !root.mkdirs()) throw IllegalStateException("Coloring storage is unavailable")
        val manager = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork
        val capabilities = manager.getNetworkCapabilities(network)
        val online = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        val metered = manager.isActiveNetworkMetered || manager.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
        promise.resolve(Arguments.createMap().apply {
          putString("rootUri", Uri.fromFile(root).toString())
          putBoolean("online", online)
          putBoolean("metered", metered)
        })
      } catch (error: Exception) { promise.reject("library_unavailable", error) }
    }
  }

  @ReactMethod
  fun verify(uri: String, bytes: Double, sha256: String, promise: Promise) {
    executor.execute {
      try {
        val parsedUri = Uri.parse(uri)
        require(parsedUri.scheme == "file")
        val file = File(parsedUri.path ?: "").canonicalFile
        require(file.path.startsWith(root.canonicalPath + File.separator))
        require(bytes > 0 && bytes <= MAX_FILE_BYTES && bytes == bytes.toLong().toDouble())
        require(Regex("^[a-f0-9]{64}$").matches(sha256))
        if (!file.isFile || file.length() != bytes.toLong()) { promise.resolve(false); return@execute }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
          val buffer = ByteArray(HASH_BUFFER_BYTES)
          var count = input.read(buffer)
          while (count >= 0) { digest.update(buffer, 0, count); count = input.read(buffer) }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        promise.resolve(actual == sha256)
      } catch (error: Exception) { promise.reject("library_verify", error) }
    }
  }

  override fun invalidate() { executor.shutdown(); super.invalidate() }
}

class SplotchLibraryPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchLibraryEnvironment(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
