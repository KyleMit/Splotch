package art.splotch.app;

import android.content.Context;
import android.net.ConnectivityManager;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

public class ColoringPackWorker extends Worker {
    public static final String JOB_PATH = "jobPath";

    public ColoringPackWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        String jobPath = getInputData().getString(JOB_PATH);
        if (jobPath == null) return Result.failure();
        File jobFile = new File(jobPath);

        try {
            JSONObject job = new JSONObject(ColoringPackStorage.readText(jobFile));
            // A job written before storage was keyed by resolution names a version directory the
            // next scan drains, and carries no marker to publish.
            if (!job.has("resolution") || !job.has("marker")) throw new StaleJobException();
            if (job.getBoolean("allowMetered") && dataSaverEnabled()) return Result.retry();

            String marker = job.getString("marker");
            File bookDirectory = ColoringPackStorage.bookDirectory(
                    getApplicationContext(),
                    job.getString("resolution"),
                    ColoringPackStorage.validBookId(job.getString("bookId")));
            synchronized (ColoringPackStorage.LOCK) {
                if (ColoringPackStorage.markerMatches(bookDirectory, marker)) return Result.success();
                ColoringPackStorage.withdrawMarker(bookDirectory);
            }

            JSONArray files = job.getJSONArray("files");
            for (int index = 0; index < files.length(); index++) {
                if (isStopped()) return Result.retry();
                downloadVerifiedFile(job.getString("baseUrl"), bookDirectory, files.getJSONObject(index));
            }

            synchronized (ColoringPackStorage.LOCK) {
                if (isStopped() || !ColoringPackStorage.hasEveryMatchingFile(bookDirectory, files)) {
                    return Result.retry();
                }
                ColoringPackStorage.writeTextAtomically(ColoringPackStorage.markerFile(bookDirectory), marker);
            }
            return Result.success();
        } catch (StaleJobException error) {
            if (jobFile.exists() && !jobFile.delete()) jobFile.deleteOnExit();
            return Result.failure();
        } catch (RetiredAssetException error) {
            // Backoff cannot bring back a file the origin deleted or regenerated in
            // place. Failing ends the background loop; the next app-driven install
            // attempts the download once more.
            return Result.failure();
        } catch (Exception error) {
            return Result.retry();
        }
    }

    private boolean dataSaverEnabled() {
        ConnectivityManager manager =
                (ConnectivityManager) getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        return manager != null
                && manager.getRestrictBackgroundStatus()
                == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED;
    }

    // An unchanged file is kept, so an app update or an interrupted install transfers only the
    // files the manifest changed or that never arrived.
    private void downloadVerifiedFile(String baseUrl, File bookDirectory, JSONObject entry)
            throws Exception {
        File destination = ColoringPackStorage.bookFile(bookDirectory, entry.getString("path"));
        synchronized (ColoringPackStorage.LOCK) {
            if (ColoringPackStorage.matches(destination, entry)) return;
        }

        File parent = destination.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Could not create coloring directory");
        }
        File partial = ColoringPackStorage.partialFile(destination);
        if (partial.exists() && !partial.delete()) throw new IllegalStateException("Stale partial file");

        String downloadPath = entry.optString("downloadPath", null);
        if (downloadPath == null) throw new StaleJobException();
        if (!downloadPath.startsWith("/coloring/") || downloadPath.contains("..")) {
            throw new IllegalArgumentException("Invalid coloring download path");
        }
        long expectedBytes = entry.getLong("bytes");
        String expectedDigest = entry.getString("sha256");
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + downloadPath).openConnection();
        connection.setConnectTimeout(30_000);
        connection.setReadTimeout(30_000);
        connection.setUseCaches(false);
        try {
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_NOT_FOUND || status == HttpURLConnection.HTTP_GONE) {
                throw new RetiredAssetException();
            }
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("Coloring download HTTP " + status);
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long bytes = 0;
            try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                    BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(partial))) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (isStopped()) throw new InterruptedException("Coloring download stopped");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    bytes += count;
                }
            }
            if (bytes != expectedBytes || !ColoringPackStorage.hex(digest.digest()).equals(expectedDigest)) {
                long advertisedBytes = connection.getContentLengthLong();
                if (advertisedBytes < 0 || advertisedBytes == bytes) throw new RetiredAssetException();
                throw new IllegalStateException("Coloring asset download was truncated");
            }
            // A worker that WorkManager replaced or cancelled keeps running until it notices, and
            // its job may come from an earlier manifest. Checking under the lock keeps it from
            // publishing once stopped, and withdrawing the marker keeps anything it did publish from
            // being vouched for until a commit or scan verifies the book again.
            synchronized (ColoringPackStorage.LOCK) {
                if (isStopped()) throw new InterruptedException("Coloring download stopped");
                ColoringPackStorage.withdrawMarker(bookDirectory);
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                    throw new IllegalStateException("Could not create coloring directory");
                }
                if (destination.exists() && !destination.delete()) {
                    throw new IllegalStateException("Could not replace coloring asset");
                }
                if (!partial.renameTo(destination)) throw new IllegalStateException("Could not publish asset");
            }
        } finally {
            connection.disconnect();
            if (partial.exists() && !partial.delete()) partial.deleteOnExit();
        }
    }

    private static final class StaleJobException extends Exception {}

    private static final class RetiredAssetException extends Exception {}
}
