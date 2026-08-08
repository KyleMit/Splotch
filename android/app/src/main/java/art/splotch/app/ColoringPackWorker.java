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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
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

        try {
            JSONObject job = new JSONObject(readText(new File(jobPath)));
            if (job.getBoolean("allowMetered") && dataSaverEnabled()) return Result.retry();

            File bookDirectory = ColoringPacksPlugin.bookDirectory(
                    getApplicationContext(), job.getString("version"), job.getString("bookId"));
            if (!bookDirectory.exists() && !bookDirectory.mkdirs()) return Result.retry();

            JSONArray files = job.getJSONArray("files");
            for (int index = 0; index < files.length(); index++) {
                if (isStopped()) return Result.retry();
                JSONObject file = files.getJSONObject(index);
                downloadVerifiedFile(job.getString("baseUrl"), bookDirectory, file);
            }

            writeText(ColoringPacksPlugin.markerFile(bookDirectory), job.getString("bookId"));
            return Result.success();
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

    private void downloadVerifiedFile(String baseUrl, File bookDirectory, JSONObject entry)
            throws Exception {
        String path = entry.getString("path");
        String bookPrefix = "/coloring/" + bookDirectory.getName() + "/";
        if (!path.startsWith(bookPrefix)) throw new IllegalArgumentException("Invalid coloring path");

        String relativePath = path.substring(bookPrefix.length());
        File destination = new File(bookDirectory, relativePath);
        if (!destination.getCanonicalPath().startsWith(bookDirectory.getCanonicalPath() + File.separator)) {
            throw new IllegalArgumentException("Coloring path escaped its book directory");
        }
        long expectedBytes = entry.getLong("bytes");
        String expectedDigest = entry.getString("sha256");
        if (matches(destination, expectedBytes, expectedDigest)) return;

        File parent = destination.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Could not create coloring directory");
        }
        File partial = new File(destination.getPath() + ".part");
        if (partial.exists() && !partial.delete()) throw new IllegalStateException("Stale partial file");

        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setConnectTimeout(30_000);
        connection.setReadTimeout(30_000);
        connection.setUseCaches(false);
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("Coloring download HTTP " + connection.getResponseCode());
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
            if (bytes != expectedBytes || !hex(digest.digest()).equals(expectedDigest)) {
                throw new IllegalStateException("Coloring asset verification failed");
            }
            if (destination.exists() && !destination.delete()) {
                throw new IllegalStateException("Could not replace coloring asset");
            }
            if (!partial.renameTo(destination)) throw new IllegalStateException("Could not publish asset");
        } finally {
            connection.disconnect();
            if (partial.exists() && !partial.delete()) partial.deleteOnExit();
        }
    }

    private boolean matches(File file, long expectedBytes, String expectedDigest) throws Exception {
        if (!file.isFile() || file.length() != expectedBytes) return false;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return hex(digest.digest()).equals(expectedDigest);
    }

    private static String readText(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            while (offset < bytes.length) {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count == -1) break;
                offset += count;
            }
            return new String(bytes, 0, offset, StandardCharsets.UTF_8);
        }
    }

    static void writeText(File file, String text) throws Exception {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Could not create job directory");
        }
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value));
        return result.toString();
    }
}
