package art.splotch.app;

import android.content.Context;

import org.json.JSONArray;

import java.io.File;

interface ColoringPackSource {
    interface Callback {
        void onInstalled(File root);

        void onFallback();

        void onCanceled();
    }

    File installed(Context context, String version, String bookId);

    boolean install(
            Context context,
            String version,
            String bookId,
            JSONArray files,
            boolean allowMetered,
            Callback callback);

    void remove(Context context);

    void close();
}
