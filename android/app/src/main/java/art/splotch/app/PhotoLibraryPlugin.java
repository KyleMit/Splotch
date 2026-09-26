package art.splotch.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Saves a drawing into the shared Pictures/Splotch folder, where it belongs to the photo library
 * rather than to the app and so survives an uninstall.
 *
 * <p>API 29+ inserts through MediaStore, which needs no permission for files the app creates. API
 * 24–28 has no RELATIVE_PATH, so it writes the public directory directly behind the
 * maxSdkVersion-28 WRITE_EXTERNAL_STORAGE grant. A parent who denies that prompt still gets the
 * drawing in the gallery, written to the app-specific media directory that needs no permission;
 * that copy is removed with the app, which is the trade the denial asked for. Only when that
 * fallback write also fails does the call reject as {@code accessDenied} rather than
 * {@code writeFailed}, because granting the permission is then the parent's way to a working save.
 *
 * <p>The image arrives as base64 slices appended to an upload rather than in one call:
 * WebView delivers each bridge message on the UI thread, and one multi-megabyte message there
 * stalls the WebView's frames (androidGallery.ts carries the measurement).
 */
@CapacitorPlugin(
        name = "PhotoLibrary",
        permissions = {
            @Permission(
                    strings = {Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    alias = PhotoLibraryPlugin.LEGACY_STORAGE_ALIAS)
        })
public class PhotoLibraryPlugin extends Plugin {
    static final String LEGACY_STORAGE_ALIAS = "legacyStorage";
    private static final String ALBUM_NAME = "Splotch";
    private static final String ERROR_INVALID_ARGUMENT = "argumentError";
    private static final String ERROR_WRITE_FAILED = "writeFailed";
    // Matches ACCESS_DENIED_ERROR_CODE in web/src/lib/drawing/screenshot.ts, drift-guarded there.
    private static final String ERROR_ACCESS_DENIED = "accessDenied";

    // A save's upload lands in well under a second, so an upload this old belongs to a page that
    // reloaded or died mid-save and will never call saveImage or discardImage for it.
    private static final long STALE_UPLOAD_MS = 60_000;

    // Keyed by upload id. Plugin methods run on the bridge's plugin thread and the permission
    // callback on the main thread, so the map is concurrent. saveImage's outcome or discardImage
    // removes an entry, and beginImage drops any that went stale.
    private final Map<String, Upload> uploads = new ConcurrentHashMap<>();

    private static final class Upload {
        final long startedAt = SystemClock.elapsedRealtime();
        final StringBuilder data = new StringBuilder();
    }

    @PluginMethod
    public void beginImage(PluginCall call) {
        long now = SystemClock.elapsedRealtime();
        uploads.values().removeIf(upload -> now - upload.startedAt > STALE_UPLOAD_MS);
        String uploadId = UUID.randomUUID().toString();
        uploads.put(uploadId, new Upload());
        JSObject result = new JSObject();
        result.put("uploadId", uploadId);
        call.resolve(result);
    }

    @PluginMethod
    public void appendImageData(PluginCall call) {
        Upload upload = uploads.get(call.getString("uploadId", ""));
        String data = call.getString("data");
        if (upload == null || data == null) {
            call.reject("appendImageData needs a begun uploadId and data", ERROR_INVALID_ARGUMENT);
            return;
        }
        upload.data.append(data);
        call.resolve();
    }

    @PluginMethod
    public void discardImage(PluginCall call) {
        uploads.remove(call.getString("uploadId", ""));
        call.resolve();
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        ImageSave image = parseOrReject(call);
        if (image == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            write(call, ERROR_WRITE_FAILED, () -> insertIntoMediaStore(image));
        } else if (getPermissionState(LEGACY_STORAGE_ALIAS) == PermissionState.PROMPT) {
            requestPermissionForAlias(LEGACY_STORAGE_ALIAS, call, "legacyStoragePermissionResult");
        } else {
            writeLegacy(call, image);
        }
    }

    @PermissionCallback
    private void legacyStoragePermissionResult(PluginCall call) {
        ImageSave image = parseOrReject(call);
        if (image == null) return;
        // Permission results arrive on the main thread; the decode and write do not belong there.
        execute(() -> writeLegacy(call, image));
    }

    private void writeLegacy(PluginCall call, ImageSave image) {
        boolean granted = getPermissionState(LEGACY_STORAGE_ALIAS) == PermissionState.GRANTED;
        write(
                call,
                granted ? ERROR_WRITE_FAILED : ERROR_ACCESS_DENIED,
                () -> writeToDirectory(granted ? sharedPicturesDirectory() : appMediaDirectory(), image));
    }

    private ImageSave parseOrReject(PluginCall call) {
        try {
            Upload upload = uploads.get(call.getString("uploadId", ""));
            return ImageSave.from(call, upload == null ? null : upload.data);
        } catch (IllegalArgumentException error) {
            uploads.remove(call.getString("uploadId", ""));
            call.reject(error.getMessage(), ERROR_INVALID_ARGUMENT, error);
            return null;
        }
    }

    private interface ImageWrite {
        void run() throws IOException;
    }

    private void write(PluginCall call, String errorCode, ImageWrite imageWrite) {
        try {
            imageWrite.run();
            call.resolve();
        } catch (IOException | RuntimeException error) {
            call.reject("Saving the image to the photo library failed", errorCode, error);
        } finally {
            uploads.remove(call.getString("uploadId", ""));
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private void insertIntoMediaStore(ImageSave image) throws IOException {
        byte[] bytes = image.decode();
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, image.displayName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, image.mimeType);
        values.put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                Environment.DIRECTORY_PICTURES + File.separator + ALBUM_NAME);
        values.put(MediaStore.Images.ImageColumns.DATE_TAKEN, System.currentTimeMillis());
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = resolver.insert(collection, values);
        if (item == null) throw new IOException("MediaStore refused the new image row");

        try {
            try (OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) throw new IOException("MediaStore returned no output stream");
                out.write(bytes);
            }
            ContentValues published = new ContentValues();
            published.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(item, published, null, null) != 1) {
                throw new IOException("MediaStore did not publish the image row");
            }
        } catch (IOException | RuntimeException error) {
            deletePendingRow(resolver, item, error);
            throw error;
        }
    }

    // A pending row that is never published stays invisible and MediaStore expires it, so a
    // failed cleanup only delays that; it must not replace the write error the caller reports.
    private static void deletePendingRow(ContentResolver resolver, Uri item, Exception cause) {
        try {
            resolver.delete(item, null, null);
        } catch (RuntimeException cleanupError) {
            cause.addSuppressed(cleanupError);
        }
    }

    // Only a never-asked permission prompts. Capacitor records any denial as PROMPT_WITH_RATIONALE
    // or DENIED, and those save to the fallback silently, so the dialog cannot return on every tap.
    // A grant made later in system Settings reads as GRANTED again.

    private File sharedPicturesDirectory() {
        return new File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                ALBUM_NAME);
    }

    @SuppressWarnings("deprecation")
    private File appMediaDirectory() {
        File[] mediaDirectories = getContext().getExternalMediaDirs();
        if (mediaDirectories.length == 0 || mediaDirectories[0] == null) {
            throw new IllegalStateException("No external media directory is mounted");
        }
        return new File(mediaDirectories[0], ALBUM_NAME);
    }

    private void writeToDirectory(File directory, ImageSave image) throws IOException {
        byte[] bytes = image.decode();
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("Could not create " + directory);
        }
        File file = unusedFile(directory, image.displayName);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        } catch (IOException | RuntimeException error) {
            file.delete();
            throw error;
        }
        MediaScannerConnection.scanFile(
                getContext(), new String[] {file.getAbsolutePath()}, new String[] {image.mimeType}, null);
    }

    // Save names carry second-resolution timestamps, so two saves in one second share a name.
    // MediaStore renames the second on API 29+; a direct file write would overwrite it instead.
    private static File unusedFile(File directory, String displayName) {
        int dot = displayName.lastIndexOf('.');
        String stem = displayName.substring(0, dot);
        String extension = displayName.substring(dot);
        File candidate = new File(directory, displayName);
        for (int suffix = 1; candidate.exists(); suffix++) {
            candidate = new File(directory, stem + " (" + suffix + ")" + extension);
        }
        return candidate;
    }

    private static final class ImageSave {
        final String mimeType;
        final String displayName;
        private final String base64Data;

        private ImageSave(String mimeType, String displayName, String base64Data) {
            this.mimeType = mimeType;
            this.displayName = displayName;
            this.base64Data = base64Data;
        }

        static ImageSave from(PluginCall call, StringBuilder upload) {
            String mimeType = call.getString("mimeType");
            String displayName = call.getString("displayName");
            if (upload == null) throw new IllegalArgumentException("uploadId names no begun upload");
            String base64Data = upload.toString();
            String extension = extensionForMimeType(mimeType);
            if (displayName == null
                    || !displayName.matches("[A-Za-z0-9_-]+\\." + extension)) {
                throw new IllegalArgumentException(
                        "displayName must be a plain file name ending in ." + extension);
            }
            if (base64Data == null || base64Data.isEmpty()) {
                throw new IllegalArgumentException("data is required");
            }
            return new ImageSave(mimeType, displayName, base64Data);
        }

        byte[] decode() {
            return Base64.decode(base64Data, Base64.DEFAULT);
        }

        private static String extensionForMimeType(String mimeType) {
            if (mimeType == null) throw new IllegalArgumentException("mimeType is required");
            switch (mimeType) {
                case "image/png":
                    return "png";
                case "image/jpeg":
                    return "jpg";
                case "image/webp":
                    return "webp";
                default:
                    throw new IllegalArgumentException("Unsupported image type " + mimeType);
            }
        }
    }
}
