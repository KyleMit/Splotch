package art.splotch.app;

import android.content.Context;
import android.net.Uri;

import androidx.lifecycle.Observer;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.List;

@CapacitorPlugin(name = "ColoringPacks")
public class ColoringPacksPlugin extends Plugin {
    private static final String WORK_NAME = "splotch-coloring-pack";
    private static final String MARKER_NAME = ".installed";
    private final ColoringPackSource distributionSource = new DistributionColoringPackSource();

    static File bookDirectory(Context context, String version, String bookId) {
        return new File(new File(new File(context.getNoBackupFilesDir(), "coloring"), version), bookId);
    }

    static File markerFile(File bookDirectory) {
        return new File(bookDirectory, MARKER_NAME);
    }

    static File padMarkerFile(Context context, String version, String bookId) {
        return new File(new File(new File(context.getNoBackupFilesDir(), "coloring"), version),
                ".pad/" + bookId + MARKER_NAME);
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            String version = requiredComponent(call, "version");
            deleteOldVersions(version);
            List<Object> ids = call.getArray("bookIds", new JSArray()).toList();
            JSArray installed = new JSArray();
            for (Object value : ids) {
                String id = String.valueOf(value);
                File directory = bookDirectory(getContext(), version, id);
                if (markerFile(directory).isFile()) {
                    JSObject pack = new JSObject();
                    pack.put("id", id);
                    pack.put("rootPath", Uri.fromFile(directory).toString());
                    installed.put(pack);
                    continue;
                }
                File distributionDirectory = distributionSource.installed(getContext(), version, id);
                if (distributionDirectory != null) {
                    JSObject pack = new JSObject();
                    pack.put("id", id);
                    pack.put("rootPath", Uri.fromFile(distributionDirectory).toString());
                    installed.put(pack);
                }
            }
            JSObject result = new JSObject();
            result.put("installed", installed);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            String version = requiredComponent(call, "version");
            String baseUrl = requiredString(call, "baseUrl");
            JSObject book = call.getObject("book");
            if (book == null) throw new IllegalArgumentException("book is required");
            String bookId = book.getString("id");
            if (bookId == null || !bookId.matches("[a-z0-9-]+")) {
                throw new IllegalArgumentException("Invalid book id");
            }
            boolean allowMetered = call.getBoolean("allowMetered", false);
            File directory = bookDirectory(getContext(), version, bookId);
            if (markerFile(directory).isFile()) {
                resolveInstalled(call, bookId, directory);
                return;
            }

            JSONArray files = new JSONArray(book.getJSONArray("files").toString());
            boolean handled = distributionSource.install(
                    getContext(),
                    version,
                    bookId,
                    files,
                    allowMetered,
                    new ColoringPackSource.Callback() {
                        @Override
                        public void onInstalled(File root) {
                            getActivity().runOnUiThread(() -> resolveInstalled(call, bookId, root));
                        }

                        @Override
                        public void onFallback() {
                            getActivity().runOnUiThread(() -> enqueueHttpsInstall(
                                    call, version, baseUrl, bookId, files, allowMetered, directory));
                        }

                        @Override
                        public void onCanceled() {
                            getActivity().runOnUiThread(() ->
                                    call.reject("Coloring-pack download was canceled"));
                        }
                    });
            if (handled) return;

            enqueueHttpsInstall(call, version, baseUrl, bookId, files, allowMetered, directory);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private void enqueueHttpsInstall(
            PluginCall call,
            String version,
            String baseUrl,
            String bookId,
            JSONArray files,
            boolean allowMetered,
            File directory) {
        try {
            JSONObject job = new JSONObject();
            job.put("version", version);
            job.put("baseUrl", baseUrl);
            job.put("bookId", bookId);
            job.put("allowMetered", allowMetered);
            job.put("files", files);
            File jobFile = new File(new File(getContext().getNoBackupFilesDir(), "coloring/jobs"), bookId + ".json");
            ColoringPackWorker.writeText(jobFile, job.toString());

            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(allowMetered ? NetworkType.CONNECTED : NetworkType.UNMETERED)
                    .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ColoringPackWorker.class)
                    .setConstraints(constraints)
                    .setInputData(new Data.Builder().putString(ColoringPackWorker.JOB_PATH, jobFile.getPath()).build())
                    .build();
            WorkManager manager = WorkManager.getInstance(getContext());
            manager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request);
            observe(call, manager, request, bookId, directory);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private void observe(
            PluginCall call,
            WorkManager manager,
            OneTimeWorkRequest request,
            String bookId,
            File directory) {
        getActivity().runOnUiThread(() -> {
            Observer<WorkInfo> observer = new Observer<>() {
                @Override
                public void onChanged(WorkInfo info) {
                    if (info == null) return;
                    boolean deferredAfterAttempt = info.getState() == WorkInfo.State.ENQUEUED
                            && info.getRunAttemptCount() > 0;
                    if (!info.getState().isFinished()
                            && !deferredAfterAttempt) {
                        return;
                    }
                    manager.getWorkInfoByIdLiveData(request.getId()).removeObserver(this);
                    if (info.getState() == WorkInfo.State.SUCCEEDED && markerFile(directory).isFile()) {
                        resolveInstalled(call, bookId, directory);
                    } else {
                        call.reject("Coloring-pack download did not complete");
                    }
                }
            };
            manager.getWorkInfoByIdLiveData(request.getId()).observeForever(observer);
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            String version = requiredComponent(call, "version");
            WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME);
            distributionSource.remove(getContext());
            deleteRecursively(new File(new File(getContext().getNoBackupFilesDir(), "coloring"), version));
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private static String requiredString(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException(key + " is required");
        return value;
    }

    private static String requiredComponent(PluginCall call, String key) {
        String value = requiredString(call, key);
        if (!value.matches("[A-Za-z0-9._-]+")) {
            throw new IllegalArgumentException("Invalid " + key);
        }
        return value;
    }

    private static void resolveInstalled(PluginCall call, String bookId, File directory) {
        JSObject result = new JSObject();
        result.put("id", bookId);
        result.put("rootPath", Uri.fromFile(directory).toString());
        call.resolve(result);
    }

    private void deleteOldVersions(String currentVersion) {
        File root = new File(getContext().getNoBackupFilesDir(), "coloring");
        File[] children = root.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()
                    && !child.getName().equals(currentVersion)
                    && !child.getName().equals("jobs")) {
                tryDeleteRecursively(child);
            }
        }
    }

    private static boolean tryDeleteRecursively(File file) {
        try {
            deleteRecursively(file);
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static void deleteRecursively(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        if (!file.delete()) throw new IllegalStateException("Could not remove " + file.getName());
    }
}
