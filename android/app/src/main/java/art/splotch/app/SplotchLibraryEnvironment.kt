package art.splotch.app

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
import java.util.concurrent.Executors

class SplotchLibraryEnvironment(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  private val root by lazy { SplotchLibraryFiles.root(context) }
  private val downloads = SplotchLibraryDownloads(context)
  private var rootReady = false
  private val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private fun ensureRoot() {
    if (rootReady) return
    if (!root.exists() && !root.mkdirs()) throw IllegalStateException("Coloring storage is unavailable")
    rootReady = true
  }
  override fun getName() = "SplotchLibraryEnvironment"

  @ReactMethod
  fun environment(promise: Promise) {
    executor.execute {
      try {
        ensureRoot()
        val network = manager.activeNetwork
        val capabilities = manager.getNetworkCapabilities(network)
        val online = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        val metered = manager.isActiveNetworkMetered
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
        ensureRoot()
        val parsedUri = Uri.parse(uri)
        require(parsedUri.scheme == "file")
        val file = File(parsedUri.path ?: "").canonicalFile
        require(file.path.startsWith(root.canonicalPath + File.separator))
        require(bytes > 0 && bytes <= SplotchLibraryFiles.MAX_FILE_BYTES && bytes == bytes.toLong().toDouble())
        require(Regex("^[a-f0-9]{64}$").matches(sha256))
        if (!file.isFile || file.length() != bytes.toLong()) { promise.resolve(false); return@execute }
        promise.resolve(SplotchLibraryFiles.sha256(file) == sha256)
      } catch (error: Exception) { promise.reject("library_verify", error) }
    }
  }

  @ReactMethod
  fun install(marker: String, identity: String, allowMetered: Boolean, promise: Promise) {
    executor.execute {
      try { downloads.install(marker, identity, allowMetered, promise) }
      catch (error: Exception) { promise.reject("library_download", error) }
    }
  }

  @ReactMethod
  fun cancelAll(promise: Promise) {
    executor.execute {
      try { downloads.cancelAll(); promise.resolve(true) }
      catch (error: Exception) { promise.reject("library_cancel", error) }
    }
  }

  override fun invalidate() { downloads.invalidate(); executor.shutdown(); super.invalidate() }
}

class SplotchLibraryPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchLibraryEnvironment(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
