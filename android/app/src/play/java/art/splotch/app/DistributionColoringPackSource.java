package art.splotch.app;

import android.content.Context;
import android.net.ConnectivityManager;

import com.google.android.play.core.assetpacks.AssetPackLocation;
import com.google.android.play.core.assetpacks.AssetPackManager;
import com.google.android.play.core.assetpacks.AssetPackManagerFactory;
import com.google.android.play.core.assetpacks.AssetPackState;
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener;
import com.google.android.play.core.assetpacks.model.AssetPackStatus;
import com.google.android.play.core.assetpacks.model.AssetPackStorageMethod;

import org.json.JSONArray;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class DistributionColoringPackSource implements ColoringPackSource {
    private static final long DOWNLOAD_TIMEOUT_MINUTES = 10;
    private static final Map<String, String> PACK_NAMES = createPackNames();
    private final ScheduledExecutorService background = Executors.newSingleThreadScheduledExecutor();

    @Override
    public File installed(Context context, String version, String bookId) {
        String packName = packName(bookId);
        if (packName == null || !ColoringPacksPlugin.padMarkerFile(context, version, bookId).isFile()) {
            return null;
        }
        return packRoot(AssetPackManagerFactory.getInstance(context), packName, bookId);
    }

    @Override
    public boolean install(
            Context context,
            String version,
            String bookId,
            JSONArray files,
            boolean allowMetered,
            Callback callback) {
        String packName = packName(bookId);
        if (packName == null) return false;

        AssetPackManager manager = AssetPackManagerFactory.getInstance(context);
        File installed = packRoot(manager, packName, bookId);
        if (installed != null) {
            verify(context, version, bookId, files, installed, callback);
            return true;
        }
        if (!playDownloadAllowed(context, allowMetered)) return false;

        DownloadAttempt attempt = new DownloadAttempt(
                manager, context, version, bookId, packName, files, allowMetered, callback);
        attempt.start();
        return true;
    }

    @Override
    public void remove(Context context) {
        AssetPackManager manager = AssetPackManagerFactory.getInstance(context);
        manager.cancel(new ArrayList<>(PACK_NAMES.values()));
        for (String packName : PACK_NAMES.values()) manager.removePack(packName);
    }

    @Override
    public void close() {
        background.shutdownNow();
    }

    private void verify(
            Context context,
            String version,
            String bookId,
            JSONArray files,
            File root,
            Callback callback) {
        background.execute(() -> {
            try {
                ColoringPackFiles.verifyDirectory(root, bookId, files);
                ColoringPackWorker.writeText(
                        ColoringPacksPlugin.padMarkerFile(context, version, bookId), bookId);
                callback.onInstalled(root);
            } catch (Exception error) {
                callback.onFallback();
            }
        });
    }

    private static File packRoot(AssetPackManager manager, String packName, String bookId) {
        AssetPackLocation location = manager.getPackLocation(packName);
        if (location == null
                || location.packStorageMethod() != AssetPackStorageMethod.STORAGE_FILES
                || location.assetsPath() == null) {
            return null;
        }
        File root = new File(new File(location.assetsPath(), "coloring"), bookId);
        return root.isDirectory() ? root : null;
    }

    private static String packName(String bookId) {
        return PACK_NAMES.get(bookId);
    }

    private static Map<String, String> createPackNames() {
        Map<String, String> packNames = new HashMap<>();
        packNames.put("dinosaur", "coloring_dinosaur");
        return Collections.unmodifiableMap(packNames);
    }

    private static boolean playDownloadAllowed(Context context, boolean allowMetered) {
        if (allowMetered) return true;
        ConnectivityManager connectivityManager =
                (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        return connectivityManager != null && !connectivityManager.isActiveNetworkMetered();
    }

    private final class DownloadAttempt implements AssetPackStateUpdateListener {
        private final AssetPackManager manager;
        private final Context context;
        private final String version;
        private final String bookId;
        private final String packName;
        private final JSONArray files;
        private final boolean allowMetered;
        private final Callback callback;
        private final AtomicBoolean settled = new AtomicBoolean();
        private ScheduledFuture<?> timeout;

        private DownloadAttempt(
                AssetPackManager manager,
                Context context,
                String version,
                String bookId,
                String packName,
                JSONArray files,
                boolean allowMetered,
                Callback callback) {
            this.manager = manager;
            this.context = context;
            this.version = version;
            this.bookId = bookId;
            this.packName = packName;
            this.files = files;
            this.allowMetered = allowMetered;
            this.callback = callback;
        }

        private void start() {
            manager.registerListener(this);
            timeout = background.schedule(
                    this::fallback, DOWNLOAD_TIMEOUT_MINUTES, TimeUnit.MINUTES);
            manager.fetch(Collections.singletonList(packName)).addOnFailureListener(error -> fallback());
        }

        @Override
        public void onStateUpdate(AssetPackState state) {
            if (!packName.equals(state.name())) return;
            switch (state.status()) {
                case AssetPackStatus.COMPLETED:
                    complete();
                    break;
                case AssetPackStatus.CANCELED:
                    cancel();
                    break;
                case AssetPackStatus.FAILED:
                case AssetPackStatus.REQUIRES_USER_CONFIRMATION:
                    fallback();
                    break;
                case AssetPackStatus.WAITING_FOR_WIFI:
                    if (allowMetered) fallback();
                    break;
                default:
                    break;
            }
        }

        private void complete() {
            if (!settle()) return;
            File root = packRoot(manager, packName, bookId);
            if (root == null) {
                callback.onFallback();
                return;
            }
            verify(context, version, bookId, files, root, callback);
        }

        private void fallback() {
            if (!settle()) return;
            manager.cancel(Collections.singletonList(packName));
            callback.onFallback();
        }

        private void cancel() {
            if (!settle()) return;
            callback.onCanceled();
        }

        private boolean settle() {
            if (!settled.compareAndSet(false, true)) return false;
            manager.unregisterListener(this);
            if (timeout != null) timeout.cancel(false);
            return true;
        }
    }
}
