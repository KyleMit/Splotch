package art.splotch.app;

import android.net.Uri;

import androidx.core.content.ContextCompat;
import androidx.lifecycle.Observer;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.Operation;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.google.common.util.concurrent.ListenableFuture;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ColoringPacks")
public class ColoringPacksPlugin extends Plugin {
    private static final String WORK_NAME = "splotch-coloring-pack";

    // Capacitor runs every plugin's calls on one shared thread, and the first scan after an
    // update hashes every downloaded file, so storage work runs here instead of stalling the
    // other plugins the app is booting with.
    private final ExecutorService storageExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void status(PluginCall call) {
        try {
            String resolution = requiredResolution(call);
            JSONArray books = new JSONArray(call.getArray("books", new JSArray()).toString());
            storageExecutor.execute(() -> {
                try {
                    JSArray installed = new JSArray();
                    for (String bookId : ColoringPackStorage.reconcile(getContext(), resolution, books)) {
                        installed.put(installedPack(bookId, ColoringPackStorage.bookDirectory(getContext(), resolution, bookId)));
                    }
                    JSObject result = new JSObject();
                    result.put("installed", installed);
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject(error.getMessage(), error);
                }
            });
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            String resolution = requiredResolution(call);
            String baseUrl = requiredString(call, "baseUrl");
            JSObject book = call.getObject("book");
            if (book == null) throw new IllegalArgumentException("book is required");
            String bookId = ColoringPackStorage.validBookId(book.getString("id"));
            String marker = book.getString("marker");
            if (marker == null || marker.isEmpty()) throw new IllegalArgumentException("marker is required");
            boolean allowMetered = call.getBoolean("allowMetered", false);
            File directory = ColoringPackStorage.bookDirectory(getContext(), resolution, bookId);
            if (ColoringPackStorage.markerMatches(directory, marker)) {
                call.resolve(installedPack(bookId, directory));
                return;
            }

            JSONObject job = new JSONObject();
            job.put("resolution", resolution);
            job.put("marker", marker);
            job.put("baseUrl", baseUrl);
            job.put("bookId", bookId);
            job.put("allowMetered", allowMetered);
            job.put("files", new JSONArray(book.getJSONArray("files").toString()));
            File jobFile = new File(ColoringPackStorage.jobsDirectory(getContext()), bookId + ".json");
            ColoringPackStorage.writeTextAtomically(jobFile, job.toString());

            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(allowMetered ? NetworkType.CONNECTED : NetworkType.UNMETERED)
                    .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ColoringPackWorker.class)
                    .setConstraints(constraints)
                    .setInputData(new Data.Builder().putString(ColoringPackWorker.JOB_PATH, jobFile.getPath()).build())
                    .build();
            WorkManager manager = WorkManager.getInstance(getContext());
            manager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request);
            observe(call, manager, request, bookId, directory, marker);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private void observe(
            PluginCall call,
            WorkManager manager,
            OneTimeWorkRequest request,
            String bookId,
            File directory,
            String marker) {
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
                    if (info.getState() == WorkInfo.State.SUCCEEDED
                            && ColoringPackStorage.markerMatches(directory, marker)) {
                        call.resolve(installedPack(bookId, directory));
                    } else {
                        call.reject("Coloring-pack download did not complete");
                    }
                }
            };
            manager.getWorkInfoByIdLiveData(request.getId()).observeForever(observer);
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelWork(call, call::resolve);
    }

    // Removes every stored book whatever layout or resolution wrote it, and every pending job.
    @PluginMethod
    public void remove(PluginCall call) {
        cancelWork(call, () -> storageExecutor.execute(() -> {
            try {
                ColoringPackStorage.removeAll(getContext());
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        }));
    }

    private void cancelWork(PluginCall call, Runnable onCancelled) {
        ListenableFuture<Operation.State.SUCCESS> cancelled =
                WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME).getResult();
        cancelled.addListener(() -> {
            try {
                cancelled.get();
                onCancelled.run();
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private static String requiredString(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException(key + " is required");
        return value;
    }

    private static String requiredResolution(PluginCall call) {
        String value = requiredString(call, "resolution");
        if (!value.matches("[a-z]+") || value.equals(ColoringPackStorage.JOBS_DIRECTORY)) {
            throw new IllegalArgumentException("Invalid resolution");
        }
        return value;
    }

    private static JSObject installedPack(String bookId, File directory) {
        JSObject result = new JSObject();
        result.put("id", bookId);
        result.put("rootPath", Uri.fromFile(directory).toString());
        return result;
    }
}
