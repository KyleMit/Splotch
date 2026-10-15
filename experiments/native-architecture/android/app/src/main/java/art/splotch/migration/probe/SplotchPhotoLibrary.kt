package art.splotch.migration.probe

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import androidx.annotation.RequiresApi
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.util.concurrent.Executors

class SplotchPhotoLibraryPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SplotchPhotoLibrary(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class SplotchPhotoLibrary(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  override fun getName() = "SplotchPhotoLibrary"

  @ReactMethod fun save(uri: String, displayName: String, mime: String, album: String, promise: Promise) {
    val source = try {
      require(album == ALBUM_NAME)
      val extension = when (mime) { "image/png" -> "png"; "image/jpeg" -> "jpg"; "image/webp" -> "webp"; else -> error("Unsupported image type") }
      require(Regex("[A-Za-z0-9_-]+\\.$extension").matches(displayName))
      val parsed = Uri.parse(uri)
      require(parsed.scheme == "file" && parsed.authority.isNullOrEmpty() && parsed.query == null && parsed.fragment == null)
      File(requireNotNull(parsed.path)).canonicalFile.also {
        require(it.parentFile == File(context.cacheDir, STAGING_DIRECTORY).canonicalFile && it.isFile && it.length() > 0)
      }
    } catch (_: Exception) { promise.resolve("failed"); return }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      write(promise, "failed") { insertIntoMediaStore(source, displayName, mime) }
      return
    }
    val permission = Manifest.permission.WRITE_EXTERNAL_STORAGE
    val preferences = context.getSharedPreferences(PERMISSION_PREFERENCES, 0)
    if (ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED || preferences.getBoolean(PERMISSION_ASKED, false)) {
      writeLegacy(source, displayName, mime, promise)
      return
    }
    UiThreadUtil.runOnUiThread {
      val activity = context.currentActivity as? PermissionAwareActivity
      if (activity == null) { promise.resolve("failed"); return@runOnUiThread }
      preferences.edit().putBoolean(PERMISSION_ASKED, true).apply()
      try {
        activity.requestPermissions(arrayOf(permission), STORAGE_PERMISSION_REQUEST, PermissionListener { code, _, _ ->
          if (code != STORAGE_PERMISSION_REQUEST) false
          else { writeLegacy(source, displayName, mime, promise); true }
        })
      } catch (_: Exception) {
        preferences.edit().remove(PERMISSION_ASKED).apply()
        promise.resolve("failed")
      }
    }
  }

  private fun write(promise: Promise, failure: String, operation: () -> Unit) {
    try {
      executor.execute {
        try { operation(); promise.resolve("photos") }
        catch (_: Exception) { promise.resolve(failure) }
      }
    } catch (_: Exception) { promise.resolve(failure) }
  }

  private fun writeLegacy(source: File, displayName: String, mime: String, promise: Promise) {
    val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    write(promise, if (granted) "failed" else "denied") {
      @Suppress("DEPRECATION")
      val parent = if (granted) Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
        else context.externalMediaDirs.firstOrNull() ?: error("No external media directory is mounted")
      val directory = File(parent, ALBUM_NAME)
      check(directory.isDirectory || directory.mkdirs())
      val destination = unusedFile(directory, displayName)
      try { source.inputStream().use { input -> destination.outputStream().use { output -> input.copyTo(output) } } }
      catch (error: Exception) { destination.delete(); throw error }
      MediaScannerConnection.scanFile(context, arrayOf(destination.absolutePath), arrayOf(mime), null)
    }
  }

  @RequiresApi(Build.VERSION_CODES.Q)
  private fun insertIntoMediaStore(source: File, displayName: String, mime: String) {
    val resolver = context.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
      put(MediaStore.MediaColumns.MIME_TYPE, mime)
      put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + File.separator + ALBUM_NAME)
      put(MediaStore.Images.ImageColumns.DATE_TAKEN, System.currentTimeMillis())
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val item = resolver.insert(collection, values) ?: error("MediaStore refused the new image row")
    try {
      source.inputStream().use { input -> requireNotNull(resolver.openOutputStream(item)).use { output -> input.copyTo(output) } }
      val published = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
      check(resolver.update(item, published, null, null) == 1)
    } catch (error: Exception) {
      try { resolver.delete(item, null, null) } catch (cleanup: Exception) { error.addSuppressed(cleanup) }
      throw error
    }
  }

  private fun unusedFile(directory: File, name: String): File {
    val stem = name.substringBeforeLast('.')
    val extension = name.substringAfterLast('.')
    var suffix = 0
    while (true) {
      val destination = File(directory, if (suffix == 0) name else "$stem ($suffix).$extension")
      if (destination.createNewFile()) return destination
      suffix += 1
    }
  }

  override fun invalidate() { executor.shutdown(); super.invalidate() }

  companion object {
    private const val ALBUM_NAME = "Splotch"
    private const val STAGING_DIRECTORY = "splotch-photo-library-v1"
    private const val PERMISSION_PREFERENCES = "splotch-photo-permission"
    private const val PERMISSION_ASKED = "asked"
    private const val STORAGE_PERMISSION_REQUEST = 7031
  }
}
